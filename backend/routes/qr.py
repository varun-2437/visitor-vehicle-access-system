import os
import qrcode
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import User, VisitorPass, AccessLog, PassStatus, LogAction, HardwareAPIKey
from schemas import (
    VisitorPassCreate,
    VisitorPassResponse,
    QRVerifyRequest,
    QRVerifyResponse,
    ManualVehicleEntryCreate,
)
from auth import get_current_user, require_role, get_hardware_or_guard
from config import QR_CODES_DIR

router = APIRouter(prefix="/api/qr", tags=["QR Codes"])


import io
import base64

def generate_qr_code_file(qr_token: str) -> str:
    """Helper to generate a QR Data URI (serverless friendly) and optional local PNG file."""
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_token)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")

    # Generate Base64 Data URI (serverless friendly, 0 disk required)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64}"

    # Optionally save to local file if writable
    try:
        filename = f"qr_{qr_token}.png"
        filepath = os.path.join(QR_CODES_DIR, filename)
        qr_img.save(filepath)
    except Exception:
        pass

    return data_uri


@router.post("/generate", response_model=VisitorPassResponse)
def generate_visitor_pass(
    data: VisitorPassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("resident", "admin")),
):
    """Generate a QR-coded visitor pass. Residents and admins only."""
    expires_at = datetime.utcnow() + timedelta(hours=data.hours_valid)

    visitor_pass = VisitorPass(
        visitor_name=data.visitor_name,
        vehicle_number=data.vehicle_number,
        purpose=data.purpose,
        resident_id=current_user.id,
        status=PassStatus.not_inside,
        expires_at=expires_at,
    )
    db.add(visitor_pass)
    db.commit()
    db.refresh(visitor_pass)

    # Generate QR code image
    visitor_pass.qr_image_path = generate_qr_code_file(visitor_pass.qr_token)
    db.commit()
    db.refresh(visitor_pass)

    return visitor_pass


@router.post("/verify", response_model=QRVerifyResponse)
def verify_qr_code(
    data: QRVerifyRequest,
    db: Session = Depends(get_db),
    user_or_hw: dict = Depends(get_hardware_or_guard),
):
    """Verify a scanned QR code token. Guards, admins, or hardware devices only."""
    visitor_pass = db.query(VisitorPass).filter(VisitorPass.qr_token == data.qr_token).first()

    if not visitor_pass:
        return QRVerifyResponse(valid=False, message="Invalid QR code — pass not found")

    # Check expiry
    if datetime.utcnow() > visitor_pass.expires_at:
        visitor_pass.status = PassStatus.expired
        db.commit()
        return QRVerifyResponse(valid=False, message="❌ Pass Expired: This visitor pass has expired.", visitor_pass=visitor_pass)

    # ── Deduplication Check ──
    # If this exact action was recorded within the last 10 seconds, return the success response without showing a false denial
    recent_log = db.query(AccessLog).filter(
        AccessLog.visitor_pass_id == visitor_pass.id,
        AccessLog.action == data.action,
        AccessLog.timestamp >= datetime.utcnow() - timedelta(seconds=10)
    ).first()
    if recent_log:
        return QRVerifyResponse(
            valid=True,
            message=f"✅ Vehicle {data.action.upper()} recorded for {visitor_pass.visitor_name}",
            visitor_pass=visitor_pass,
        )

    # ── State Validation ──
    if data.action == "entry":
        if visitor_pass.status in [PassStatus.in_campus, PassStatus.used]:
            return QRVerifyResponse(
                valid=False,
                message="❌ Entry Denied: This pass has ALREADY been scanned for entry! Vehicle is currently inside campus.",
                visitor_pass=visitor_pass,
            )
        if visitor_pass.status == PassStatus.exited:
            return QRVerifyResponse(
                valid=False,
                message="❌ Entry Denied: This pass has completed its visit and the vehicle has already exited.",
                visitor_pass=visitor_pass,
            )

    if data.action == "exit":
        if visitor_pass.status in [PassStatus.not_inside, PassStatus.approved, PassStatus.pending]:
            return QRVerifyResponse(
                valid=False,
                message="❌ Exit Denied: This vehicle has NOT entered the campus yet.",
                visitor_pass=visitor_pass,
            )
        if visitor_pass.status == PassStatus.exited:
            return QRVerifyResponse(
                valid=False,
                message="❌ Exit Denied: This vehicle has ALREADY exited the campus.",
                visitor_pass=visitor_pass,
            )

    # Valid — create access log & update vehicle status
    # Determine who scanned it
    scanned_by_id = None
    if user_or_hw["type"] == "user":
        scanned_by_id = user_or_hw["user"].id
    else:
        # For hardware, we can set it to the admin who created the key, or we need a special handling.
        # Let's see models.py: scanned_by is an Integer ForeignKey("users.id").
        # For hardware, maybe we get the admin user from the hardware key, or we just leave it as None if nullable.
        # It's nullable=False. So we need a valid user ID. 
        # For simplicity, we can fetch the user who created the API key or a special 'system' user.
        hw_key = db.query(HardwareAPIKey).filter(HardwareAPIKey.id == user_or_hw["id"]).first()
        scanned_by_id = hw_key.created_by if hw_key else 1

    log = AccessLog(
        visitor_pass_id=visitor_pass.id,
        scanned_by=scanned_by_id,
        action=data.action,
    )
    db.add(log)

    if data.action == "entry":
        visitor_pass.status = PassStatus.in_campus
    elif data.action == "exit":
        visitor_pass.status = PassStatus.exited

    db.commit()
    db.refresh(visitor_pass)

    return QRVerifyResponse(
        valid=True,
        message=f"✅ Vehicle {data.action.upper()} recorded for {visitor_pass.visitor_name}",
        visitor_pass=visitor_pass,
    )



@router.get("/my-passes", response_model=List[VisitorPassResponse])
def get_my_passes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("resident", "admin")),
):
    """List all visitor passes created by the current resident."""
    passes = (
        db.query(VisitorPass)
        .filter(VisitorPass.resident_id == current_user.id)
        .order_by(VisitorPass.created_at.desc())
        .all()
    )
    return passes


@router.post("/manual-entry", response_model=QRVerifyResponse)
def manual_vehicle_entry(
    data: ManualVehicleEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """Manual vehicle entry/exit registration by guards (without prior QR pass)."""
    # Find host resident if flat number is provided
    resident_id = current_user.id
    if data.flat_number:
        res = db.query(User).filter(User.flat_number == data.flat_number).first()
        if res:
            resident_id = res.id

    # Create instant visitor pass
    visitor_pass = VisitorPass(
        visitor_name=data.visitor_name,
        vehicle_number=data.vehicle_number,
        purpose=data.purpose or "Manual Gate Register",
        resident_id=resident_id,
        status=PassStatus.in_campus if data.action == "entry" else PassStatus.exited,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(visitor_pass)
    db.commit()
    db.refresh(visitor_pass)

    # Always generate QR code image for manual gate entry
    visitor_pass.qr_image_path = generate_qr_code_file(visitor_pass.qr_token)
    db.commit()
    db.refresh(visitor_pass)

    # Create access log
    log = AccessLog(
        visitor_pass_id=visitor_pass.id,
        scanned_by=current_user.id,
        action=data.action,
    )
    db.add(log)
    db.commit()
    db.refresh(visitor_pass)

    return QRVerifyResponse(
        valid=True,
        message=f"✅ Manual {data.action.upper()} logged for Vehicle {data.vehicle_number.upper()}",
        visitor_pass=visitor_pass,
    )


from typing import Optional

def parse_iso(date_str: str) -> datetime:
    if date_str.endswith('Z'):
        date_str = date_str[:-1] + '+00:00'
    return datetime.fromisoformat(date_str).replace(tzinfo=None)

@router.get("/today-passes", response_model=List[VisitorPassResponse])
def get_today_passes(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    all_time: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """List visitor passes. Defaults to last 24 hours unless date range or all_time=true is provided."""
    query = db.query(VisitorPass)
    if from_date:
        query = query.filter(VisitorPass.created_at >= parse_iso(from_date))
    if to_date:
        query = query.filter(VisitorPass.created_at <= parse_iso(to_date))

    if not from_date and not to_date and not all_time:
        since = datetime.utcnow() - timedelta(hours=24)
        query = query.filter(VisitorPass.created_at >= since)

    return query.order_by(VisitorPass.created_at.desc()).all()


from schemas import AccessLogResponse

@router.get("/today-logs", response_model=List[AccessLogResponse])
def get_today_logs(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    all_time: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """List vehicle entry and exit access logs. Defaults to last 24 hours unless date range or all_time=true is provided."""
    query = db.query(AccessLog)
    if from_date:
        query = query.filter(AccessLog.timestamp >= parse_iso(from_date))
    if to_date:
        query = query.filter(AccessLog.timestamp <= parse_iso(to_date))

    if not from_date and not to_date and not all_time:
        since = datetime.utcnow() - timedelta(hours=24)
        query = query.filter(AccessLog.timestamp >= since)

    return query.order_by(AccessLog.timestamp.desc()).all()


@router.get("/stats")
def get_campus_vehicle_stats(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get live campus vehicle statistics for the present day (resets daily):
    - vehicles_inside: Active vehicles that entered today and are currently inside campus
    - total_visited: Total vehicle entries recorded today
    - total_passes: Total visitor passes created today
    """
    if from_date:
        start_time = parse_iso(from_date)
    else:
        now = datetime.utcnow()
        start_time = datetime(now.year, now.month, now.day, 0, 0, 0)

    if to_date:
        end_time = parse_iso(to_date)
    else:
        now = datetime.utcnow()
        end_time = datetime(now.year, now.month, now.day, 23, 59, 59, 999999)

    # 1. Vehicles that entered today and are currently inside campus
    vehicles_inside = (
        db.query(func.count(func.distinct(VisitorPass.id)))
        .join(AccessLog, AccessLog.visitor_pass_id == VisitorPass.id)
        .filter(
            AccessLog.action == LogAction.entry,
            AccessLog.timestamp >= start_time,
            AccessLog.timestamp <= end_time,
            VisitorPass.status.in_([PassStatus.in_campus, PassStatus.used]),
            VisitorPass.vehicle_number.isnot(None),
            func.trim(VisitorPass.vehicle_number) != "",
        )
        .scalar() or 0
    )

    # 2. Total vehicle entries recorded today
    total_visited = (
        db.query(func.count(AccessLog.id))
        .join(VisitorPass, AccessLog.visitor_pass_id == VisitorPass.id)
        .filter(
            AccessLog.action == LogAction.entry,
            AccessLog.timestamp >= start_time,
            AccessLog.timestamp <= end_time,
            VisitorPass.vehicle_number.isnot(None),
            func.trim(VisitorPass.vehicle_number) != "",
        )
        .scalar() or 0
    )

    # 3. Total visitor passes created today
    total_passes = (
        db.query(func.count(VisitorPass.id))
        .filter(
            VisitorPass.created_at >= start_time,
            VisitorPass.created_at <= end_time,
        )
        .scalar() or 0
    )

    return {
        "vehicles_inside": vehicles_inside,
        "total_visited": total_visited,
        "total_passes": total_passes,
        "date": start_time.strftime("%Y-%m-%d"),
    }


