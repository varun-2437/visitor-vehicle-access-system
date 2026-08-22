import os
import qrcode
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import User, VisitorPass, AccessLog, PassStatus, LogAction
from schemas import VisitorPassCreate, VisitorPassResponse, QRVerifyRequest, QRVerifyResponse
from auth import get_current_user, require_role
from config import QR_CODES_DIR

router = APIRouter(prefix="/api/qr", tags=["QR Codes"])


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
        expires_at=expires_at,
    )
    db.add(visitor_pass)
    db.commit()
    db.refresh(visitor_pass)

    # Generate QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(visitor_pass.qr_token)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_{visitor_pass.qr_token}.png"
    filepath = os.path.join(QR_CODES_DIR, filename)
    qr_img.save(filepath)

    visitor_pass.qr_image_path = f"/qr_codes/{filename}"
    db.commit()
    db.refresh(visitor_pass)

    return visitor_pass


@router.post("/verify", response_model=QRVerifyResponse)
def verify_qr_code(
    data: QRVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """Verify a scanned QR code token. Guards and admins only."""
    visitor_pass = db.query(VisitorPass).filter(VisitorPass.qr_token == data.qr_token).first()

    if not visitor_pass:
        return QRVerifyResponse(valid=False, message="Invalid QR code — pass not found")

    # Check expiry
    if datetime.utcnow() > visitor_pass.expires_at:
        visitor_pass.status = PassStatus.expired
        db.commit()
        return QRVerifyResponse(valid=False, message="This visitor pass has expired")

    # Check if already used (for entry)
    if visitor_pass.status == PassStatus.used and data.action == "entry":
        return QRVerifyResponse(valid=False, message="This pass has already been used for entry")

    # Valid — create access log
    log = AccessLog(
        visitor_pass_id=visitor_pass.id,
        scanned_by=current_user.id,
        action=data.action,
    )
    db.add(log)

    if data.action == "entry":
        visitor_pass.status = PassStatus.used

    db.commit()
    db.refresh(visitor_pass)

    return QRVerifyResponse(
        valid=True,
        message=f"✅ {data.action.upper()} recorded for {visitor_pass.visitor_name}",
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
