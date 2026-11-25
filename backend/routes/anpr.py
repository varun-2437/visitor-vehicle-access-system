"""
ANPR (Automatic Number Plate Recognition) Route
Handles data reception for the AI plate detection model and gate verification.
The AI model receives input data via:
  1. Live Camera Snapshot / Multipart Image Upload (raw bytes / OpenCV BGR)
  2. Base64 Encoded Image Payload
  3. External Edge Hardware Trigger (CCTV / RTSP / Raspberry Pi)
"""

import os
import re
import io
import time
import base64
import socket
import threading
import urllib.request
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import User, VisitorPass, AccessLog, PassStatus, LogAction
from config import SECRET_KEY, ALGORITHM
from schemas import (
    ANPRDetectResponse,
    ANPRLogRequest,
    QRVerifyResponse,
    VisitorPassResponse,
)
from auth import require_role
from routes.qr import generate_qr_code_file

router = APIRouter(prefix="/api/anpr", tags=["ANPR AI Model"])
optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_optional_user(
    token: Optional[str] = Depends(optional_oauth2),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            return None
        return db.query(User).filter(User.username == username).first()
    except JWTError:
        return None


# In-memory storage for remote phone camera live feed & snapshots
latest_remote_frame = {
    "image_bytes": None,
    "preview_base64": None,
    "timestamp": None,
    "device_info": "Unknown Phone",
    "frame_id": 0,
    "consumed": True,
    "detection": None,
    "stream_state": "disconnected",  # "disconnected", "connected", "streaming", "paused"
    "sender_username": None,
    "sender_name": None,
    "last_heartbeat": None,
    "stream_mode": "snapshot",
}
frame_condition = threading.Condition()
_bg_anpr_lock = threading.Lock()
_bg_anpr_running = False
_bg_anpr_last_run = 0.0

# ─── Load Real ANPR Models at startup ───
alpr_model = None
try:
    from fast_alpr import ALPR
    alpr_model = ALPR(
        detector_model='yolo-v9-t-640-license-plate-end2end',
        ocr_model='cct-s-v2-global-model',
        detector_providers=['CPUExecutionProvider'],
        ocr_providers=['CPUExecutionProvider'],
        detector_conf_thresh=0.25
    )
    print("✅ Fast-ALPR Model loaded successfully for live ANPR!")
except Exception as e:
    print(f"⚠️ Fast-ALPR load notice: {e}")

easyocr_reader = None
def get_easyocr():
    global easyocr_reader
    if easyocr_reader is None:
        try:
            import easyocr
            easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        except Exception:
            pass
    return easyocr_reader

def get_lan_ip():
    """Retrieve LAN IP of this machine so phones on the same Wi-Fi can connect."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# Strict Plate Validation Patterns (Indian RTO & Bharat BH Series)
STANDARD_PLATE_EXACT = re.compile(r'^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$')
BH_PLATE_EXACT = re.compile(r'^\d{2}BH\d{4}[A-Z]{1,2}$')
INDIAN_PLATE_PATTERN = re.compile(
    r'(?:[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}|\d{2}BH\d{4}[A-Z]{1,2})'
)


def normalize_plate_string(raw_text: str) -> str:
    """Normalize plate text: remove spaces, punctuation, special symbols, uppercase."""
    if not raw_text:
        return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', raw_text).upper()
    return clean


def extract_valid_plate(raw_text: str) -> str:
    """
    Strictly validates and extracts only genuine number-plate formatted strings (6-11 chars).
    Rejects long garbage OCR strings (e.g. keyboards, paragraphs, plain words).
    """
    clean = normalize_plate_string(raw_text)
    if not clean or len(clean) < 6 or len(clean) > 16:
        return ""
    if STANDARD_PLATE_EXACT.fullmatch(clean) or BH_PLATE_EXACT.fullmatch(clean):
        return clean if 6 <= len(clean) <= 11 else ""
    match = INDIAN_PLATE_PATTERN.search(clean)
    if match:
        candidate = match.group(0)
        if 6 <= len(candidate) <= 11:
            return candidate
    return ""


def run_anpr_inference(
    image_bytes: Optional[bytes] = None,
    manual_hint: Optional[str] = None,
    allow_slow_ocr: bool = True,
) -> dict:
    """
    Real AI Model Ingestion & Inference:
    1. Uses Fast-ALPR (YOLOv9 + CCT-S-v2 Transformer) for plate localization & OCR.
    2. Optional Pytesseract / EasyOCR fallback on single snapshots.
    3. Strictly validates plate format so arbitrary text/large strings are ignored.
    """
    start_time = time.time()
    detected_plate = ""
    confidence = 0.0
    model_name = "Fast-ALPR (YOLOv9 + CCT-S-v2 Transformer)"
    preview_base64 = None

    if manual_hint and manual_hint.strip():
        detected_plate = extract_valid_plate(manual_hint) or normalize_plate_string(manual_hint)[:11]
        confidence = 0.99
        model_name = "Simulator / Manual Override"

    elif image_bytes and len(image_bytes) > 0:
        try:
            import cv2
            import numpy as np

            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is not None:
                # ── Tier 1: Real Fast-ALPR YOLOv9 Detection & Transformer OCR ──
                if alpr_model is not None:
                    try:
                        results = alpr_model.predict(img)
                        if results:
                            for cand in sorted(results, key=lambda r: r.detection.confidence, reverse=True):
                                valid_plate = extract_valid_plate(cand.ocr.text)
                                if not valid_plate:
                                    continue
                                detected_plate = valid_plate
                                confidence = float(cand.detection.confidence)
                                model_name = "Fast-ALPR (YOLOv9 + CCT-S-v2 Transformer)"

                                box = cand.detection.bounding_box
                                h_img, w_img = img.shape[:2]
                                x1 = max(0, int(box.x1) - 6)
                                y1 = max(0, int(box.y1) - 6)
                                x2 = min(w_img, int(box.x2) + 6)
                                y2 = min(h_img, int(box.y2) + 6)
                                if x2 > x1 and y2 > y1:
                                    crop = img[y1:y2, x1:x2]
                                    _, buf = cv2.imencode('.jpg', crop)
                                    preview_base64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"
                                break
                    except Exception as e:
                        print(f"[Fast-ALPR Predict Warning]: {e}")

                # ── Tier 2: OCR Fallback (Pytesseract - strict format only) ──
                if not detected_plate and allow_slow_ocr:
                    try:
                        import pytesseract
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                        txt = pytesseract.image_to_string(thresh, config='--oem 3 --psm 7').strip()
                        valid_tess = extract_valid_plate(txt)
                        if valid_tess:
                            detected_plate = valid_tess
                            confidence = 0.88
                            model_name = "Pytesseract OCR Fallback"
                    except Exception:
                        pass

                # ── Tier 3: OCR Fallback (EasyOCR - strict format only, rejects long strings) ──
                if not detected_plate and allow_slow_ocr:
                    try:
                        reader = get_easyocr()
                        if reader is not None:
                            results = reader.readtext(img, detail=0)
                            # Check individual chunks & adjacent 2-line combinations (handles 2-line Indian plates)
                            candidates = list(results)
                            for i in range(len(results) - 1):
                                candidates.append(f"{results[i]}{results[i + 1]}")
                            for raw_cand in candidates:
                                valid_easy = extract_valid_plate(raw_cand)
                                if valid_easy:
                                    detected_plate = valid_easy
                                    confidence = 0.85
                                    model_name = "EasyOCR Fallback"
                                    break
                    except Exception:
                        pass

        except Exception as e:
            print(f"[ANPR Pipeline Processing Error]: {e}")

    elapsed_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "plate": detected_plate,
        "confidence": round(confidence, 2) if confidence > 0 else 0.0,
        "processing_time_ms": elapsed_ms,
        "model_name": model_name,
        "preview_base64": preview_base64,
        "success": bool(detected_plate),
    }


@router.post("/detect-plate", response_model=ANPRDetectResponse)
async def detect_vehicle_plate(
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    mock_plate: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("resident", "guard", "admin")),
):
    """
    Receives camera frame or vehicle photo for ANPR AI plate recognition,
    extracts the number plate, and looks up matching pre-approved visitor passes.
    """
    image_bytes = None

    # Case 1: Image sent as multipart file upload (from guard camera or file chooser)
    if file:
        image_bytes = await file.read()
    # Case 2: Image sent as base64 string (from live webcam canvas)
    elif image_base64:
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
        try:
            image_bytes = base64.b64decode(image_base64)
        except Exception:
            pass

    # Process image with model logic
    inference_result = run_anpr_inference(
        image_bytes=image_bytes,
        manual_hint=mock_plate,
    )

    detected_plate = inference_result["plate"]

    if not detected_plate:
        return ANPRDetectResponse(
            success=False,
            detected_plate="",
            confidence=0.0,
            processing_time_ms=inference_result["processing_time_ms"],
            model_name=inference_result["model_name"],
            message="No vehicle license plate detected in this image. Please position the camera closer or ensure clear lighting.",
            plate_image_data=inference_result.get("preview_base64"),
            pass_found=False,
            visitor_pass=None,
        )

    # ── Database Lookup: Check if an approved visitor pass exists for this plate ──
    clean_detected = normalize_plate_string(detected_plate)
    matching_pass = None

    all_passes = db.query(VisitorPass).all()
    for p in all_passes:
        if p.vehicle_number and normalize_plate_string(p.vehicle_number) == clean_detected:
            matching_pass = p
            # Prefer active pass inside or not inside over expired/exited
            if p.status in [PassStatus.not_inside, PassStatus.in_campus, PassStatus.approved]:
                break

    pass_found = matching_pass is not None
    message = (
        f"Plate {detected_plate} detected. Active Visitor Pass found (#{matching_pass.id if matching_pass else ''})."
        if pass_found
        else f"Plate {detected_plate} detected. No active pre-approved pass found. Ready for walk-in entry."
    )

    return ANPRDetectResponse(
        success=True,
        detected_plate=detected_plate,
        confidence=inference_result["confidence"],
        processing_time_ms=inference_result["processing_time_ms"],
        model_name=inference_result["model_name"],
        message=message,
        plate_image_data=inference_result.get("preview_base64"),
        pass_found=pass_found,
        visitor_pass=matching_pass,
    )


@router.post("/log-entry-exit", response_model=QRVerifyResponse)
def log_anpr_entry_exit(
    data: ANPRLogRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """
    Logs vehicle access (entry or exit) based on the number plate fetched from the model.
    Updates pass status and records access log automatically.
    """
    raw_clean = normalize_plate_string(data.vehicle_number)
    valid_plate = extract_valid_plate(data.vehicle_number)
    if not raw_clean or (not valid_plate and not data.pass_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid vehicle number plate format. Please capture or enter a valid plate (e.g. MH14DX5842).",
        )
    clean_plate = valid_plate or raw_clean

    target_pass = None

    # If specific pass ID is provided
    if data.pass_id:
        target_pass = db.query(VisitorPass).filter(VisitorPass.id == data.pass_id).first()

    # Otherwise look up by vehicle number
    if not target_pass:
        candidates = db.query(VisitorPass).filter(VisitorPass.vehicle_number.isnot(None)).all()
        for p in candidates:
            if normalize_plate_string(p.vehicle_number) == clean_plate:
                target_pass = p
                if data.action == "entry" and p.status in [PassStatus.not_inside, PassStatus.approved]:
                    break
                elif data.action == "exit" and p.status in [PassStatus.in_campus, PassStatus.used]:
                    break

    # If an existing pass is found, update it
    if target_pass:
        if data.action == "entry":
            target_pass.status = PassStatus.in_campus
        else:
            target_pass.status = PassStatus.exited

        log = AccessLog(
            visitor_pass_id=target_pass.id,
            scanned_by=current_user.id,
            action=data.action,
        )
        db.add(log)
        db.commit()
        db.refresh(target_pass)

        return QRVerifyResponse(
            valid=True,
            message=f"ANPR Verified: Vehicle {clean_plate} logged as {data.action.upper()} successfully!",
            visitor_pass=target_pass,
        )

    # If no pre-approved pass exists, automatically create a walk-in pass for this vehicle
    resident_id = current_user.id
    if data.flat_number:
        res = db.query(User).filter(User.flat_number == data.flat_number).first()
        if res:
            resident_id = res.id

    new_pass = VisitorPass(
        visitor_name=data.visitor_name or f"Visitor ({clean_plate})",
        vehicle_number=clean_plate,
        purpose=data.purpose or "ANPR Automated Gate Entry",
        resident_id=resident_id,
        status=PassStatus.in_campus if data.action == "entry" else PassStatus.exited,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(new_pass)
    db.commit()
    db.refresh(new_pass)

    new_pass.qr_image_path = generate_qr_code_file(new_pass.qr_token)
    db.commit()
    db.refresh(new_pass)

    log = AccessLog(
        visitor_pass_id=new_pass.id,
        scanned_by=current_user.id,
        action=data.action,
    )
    db.add(log)
    db.commit()
    db.refresh(new_pass)

    return QRVerifyResponse(
        valid=True,
        message=f"ANPR Auto-Registration: Vehicle {clean_plate} logged as {data.action.upper()}.",
        visitor_pass=new_pass,
    )


@router.get("/network-info")
def get_network_info():
    """Returns the local IP address and phone camera connection link with QR code."""
    lan_ip = get_lan_ip()
    phone_url = f"http://{lan_ip}:5173/phone-camera"
    qr_data_uri = generate_qr_code_file(phone_url)
    return {
        "lan_ip": lan_ip,
        "phone_camera_url": phone_url,
        "qr_data_uri": qr_data_uri,
    }


@router.post("/stream-status")
def update_remote_stream_status(
    state: str = Form(...),  # "connected", "streaming", "paused", "disconnected"
    device_info: Optional[str] = Form("Mobile Device"),
    stream_mode: Optional[str] = Form("live_stream"),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Updates remote phone camera connection state for the web ANPR status indicator."""
    global latest_remote_frame
    allowed_states = {"connected", "streaming", "paused", "disconnected"}
    clean_state = state.strip().lower()
    if clean_state not in allowed_states:
        raise HTTPException(status_code=400, detail=f"Invalid stream state: {state}")

    if current_user and current_user.role not in ("camera", "guard", "admin"):
        raise HTTPException(status_code=403, detail="Only camera, guard, or admin accounts can stream gate feeds.")

    now_iso = datetime.utcnow().isoformat()
    latest_remote_frame["stream_state"] = clean_state
    latest_remote_frame["stream_mode"] = stream_mode or "live_stream"
    latest_remote_frame["device_info"] = device_info or latest_remote_frame.get("device_info") or "Mobile Device"

    if current_user:
        latest_remote_frame["sender_username"] = current_user.username
        latest_remote_frame["sender_name"] = current_user.full_name

    if clean_state == "disconnected":
        latest_remote_frame["last_heartbeat"] = None
    else:
        latest_remote_frame["last_heartbeat"] = now_iso

    return {
        "stream_state": latest_remote_frame["stream_state"],
        "sender_username": latest_remote_frame["sender_username"],
        "sender_name": latest_remote_frame["sender_name"],
        "device_info": latest_remote_frame["device_info"],
        "timestamp": now_iso,
    }


def _serialize_pass_dict(p: Optional[VisitorPass]) -> Optional[dict]:
    if not p:
        return None
    return {
        "id": p.id,
        "visitor_name": p.visitor_name,
        "vehicle_number": p.vehicle_number,
        "purpose": p.purpose,
        "qr_token": p.qr_token,
        "status": p.status.value if hasattr(p.status, "value") else p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "expires_at": p.expires_at.isoformat() if p.expires_at else None,
        "qr_image_path": p.qr_image_path,
        "resident": {
            "id": p.resident.id,
            "username": p.resident.username,
            "full_name": p.resident.full_name,
            "flat_number": p.resident.flat_number,
        } if p.resident else None,
    }


def _match_pass_for_plate(db: Session, detected_plate: str) -> Optional[VisitorPass]:
    clean_detected = normalize_plate_string(detected_plate)
    if not clean_detected:
        return None
    matching_pass = None
    all_passes = db.query(VisitorPass).all()
    for p in all_passes:
        if p.vehicle_number and normalize_plate_string(p.vehicle_number) == clean_detected:
            matching_pass = p
            if p.status in [PassStatus.not_inside, PassStatus.in_campus, PassStatus.approved]:
                break
    return matching_pass


def _run_background_anpr_worker(raw_bytes: bytes):
    global _bg_anpr_running, _bg_anpr_last_run, latest_remote_frame
    try:
        # Fast-ALPR only (no slow CPU EasyOCR) for high-speed live stream
        inference_result = run_anpr_inference(image_bytes=raw_bytes, allow_slow_ocr=False)
        detected_plate = inference_result.get("plate", "")
        if detected_plate:
            db = SessionLocal()
            try:
                matching_pass = _match_pass_for_plate(db, detected_plate)
                pass_dict = _serialize_pass_dict(matching_pass)
            finally:
                db.close()

            pass_found = pass_dict is not None
            latest_remote_frame["consumed"] = False
            latest_remote_frame["detection"] = {
                "success": True,
                "detected_plate": detected_plate,
                "confidence": inference_result["confidence"],
                "processing_time_ms": inference_result["processing_time_ms"],
                "model_name": inference_result["model_name"],
                "plate_image_data": inference_result.get("preview_base64"),
                "pass_found": pass_found,
                "visitor_pass": pass_dict,
                "visitor_name": pass_dict["visitor_name"] if pass_dict else None,
                "flat_number": pass_dict["resident"]["flat_number"] if (pass_dict and pass_dict.get("resident")) else None,
                "pass_id": pass_dict["id"] if pass_dict else None,
            }
    except Exception as e:
        print(f"[Background ANPR Worker Error]: {e}")
    finally:
        with _bg_anpr_lock:
            _bg_anpr_last_run = time.time()
            _bg_anpr_running = False


def _trigger_background_anpr_if_ready(raw_bytes: bytes):
    global _bg_anpr_running
    now = time.time()
    with _bg_anpr_lock:
        if _bg_anpr_running or (now - _bg_anpr_last_run) < 0.7:
            return
        _bg_anpr_running = True
    threading.Thread(target=_run_background_anpr_worker, args=(raw_bytes,), daemon=True).start()


@router.post("/remote-frame")
async def upload_remote_phone_frame(
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    device_info: Optional[str] = Form("Mobile Device"),
    stream_mode: Optional[str] = Form("snapshot"),
    run_anpr: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Receives camera frames wirelessly from the Android app or phone browser.
    - For live_stream with run_anpr=False: saves frame immediately (<5ms) for smooth ~8-12 FPS
      MJPEG video and schedules non-blocking Fast-ALPR inference in the background.
    - For single snapshots (run_anpr=True): runs full ANPR immediately and returns detection.
    """
    global latest_remote_frame
    if current_user and current_user.role not in ("camera", "guard", "admin"):
        raise HTTPException(status_code=403, detail="Only camera, guard, or admin accounts can stream gate feeds.")

    raw_bytes = None
    if file:
        raw_bytes = await file.read()
    elif image_base64:
        clean_b64 = image_base64.split(",")[1] if "," in image_base64 else image_base64
        try:
            raw_bytes = base64.b64decode(clean_b64)
        except Exception:
            pass

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="No valid image payload received from phone.")

    now_iso = datetime.utcnow().isoformat()
    latest_remote_frame["image_bytes"] = raw_bytes
    latest_remote_frame["timestamp"] = now_iso
    latest_remote_frame["last_heartbeat"] = now_iso
    latest_remote_frame["stream_state"] = "streaming" if stream_mode == "live_stream" else "connected"
    latest_remote_frame["stream_mode"] = stream_mode or "snapshot"
    latest_remote_frame["device_info"] = device_info or "Mobile Phone Camera"
    if current_user:
        latest_remote_frame["sender_username"] = current_user.username
        latest_remote_frame["sender_name"] = current_user.full_name
    latest_remote_frame["frame_id"] += 1

    # Wake up any active MJPEG stream listeners immediately
    with frame_condition:
        frame_condition.notify_all()

    # ── Fast-Path for Continuous Live Video Feed (~8-12 FPS) ──
    if stream_mode == "live_stream" and not run_anpr:
        latest_remote_frame["preview_base64"] = None  # Avoid expensive base64 encoding every 120ms; MJPEG serves raw bytes
        _trigger_background_anpr_if_ready(raw_bytes)
        cached = latest_remote_frame.get("detection") or {}
        return {
            "success": bool(cached.get("detected_plate")),
            "frame_id": latest_remote_frame["frame_id"],
            "timestamp": now_iso,
            "stream_state": latest_remote_frame["stream_state"],
            "detected_plate": cached.get("detected_plate") or "",
            "confidence": cached.get("confidence") or 0.0,
            "processing_time_ms": cached.get("processing_time_ms") or 0.0,
            "model_name": cached.get("model_name") or "Fast-ALPR Live",
            "pass_found": bool(cached.get("pass_found")),
            "visitor_name": cached.get("visitor_name"),
            "flat_number": cached.get("flat_number"),
            "pass_id": cached.get("pass_id"),
            "message": "Live frame ingested",
        }

    # ── Synchronous Path for Explicit Snapshots ──
    b64_preview = f"data:image/jpeg;base64,{base64.b64encode(raw_bytes).decode('utf-8')}"
    latest_remote_frame["preview_base64"] = b64_preview

    inference_result = run_anpr_inference(image_bytes=raw_bytes, allow_slow_ocr=True)
    detected_plate = inference_result.get("plate", "")
    matching_pass = _match_pass_for_plate(db, detected_plate)
    pass_dict = _serialize_pass_dict(matching_pass)
    pass_found = pass_dict is not None

    latest_remote_frame["consumed"] = False
    latest_remote_frame["detection"] = {
        "success": bool(detected_plate),
        "detected_plate": detected_plate,
        "confidence": inference_result["confidence"],
        "processing_time_ms": inference_result["processing_time_ms"],
        "model_name": inference_result["model_name"],
        "plate_image_data": inference_result.get("preview_base64") or b64_preview,
        "pass_found": pass_found,
        "visitor_pass": pass_dict,
        "visitor_name": pass_dict["visitor_name"] if pass_dict else None,
        "flat_number": pass_dict["resident"]["flat_number"] if (pass_dict and pass_dict.get("resident")) else None,
        "pass_id": pass_dict["id"] if pass_dict else None,
    }

    if detected_plate:
        message = (
            f"Plate {detected_plate} detected! Active Visitor Pass found (#{matching_pass.id})."
            if pass_found
            else f"Plate {detected_plate} detected. Sent to laptop gate terminal."
        )
    else:
        message = "No valid license plate recognized in this snapshot. Please frame the plate clearly."

    return {
        "success": bool(detected_plate),
        "frame_id": latest_remote_frame["frame_id"],
        "timestamp": latest_remote_frame["timestamp"],
        "stream_state": latest_remote_frame["stream_state"],
        "detected_plate": detected_plate,
        "confidence": inference_result["confidence"],
        "processing_time_ms": inference_result["processing_time_ms"],
        "model_name": inference_result["model_name"],
        "pass_found": pass_found,
        "visitor_name": matching_pass.visitor_name if matching_pass else None,
        "flat_number": matching_pass.resident.flat_number if (matching_pass and matching_pass.resident) else None,
        "purpose": matching_pass.purpose if matching_pass else None,
        "pass_id": matching_pass.id if matching_pass else None,
        "message": message,
        "preview_base64": inference_result.get("preview_base64") or b64_preview,
    }


@router.get("/mjpeg-feed")
def stream_remote_mjpeg():
    """Real-time MJPEG stream endpoint for smooth zero-lag video playback on the Web ANPR page."""
    def generate():
        last_sent_id = -1
        while True:
            with frame_condition:
                if latest_remote_frame["frame_id"] == last_sent_id:
                    frame_condition.wait(timeout=2.0)
                frame_bytes = latest_remote_frame.get("image_bytes")
                curr_id = latest_remote_frame["frame_id"]

            if frame_bytes and curr_id != last_sent_id:
                last_sent_id = curr_id
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(frame_bytes)}\r\n\r\n".encode("ascii")
                    + frame_bytes
                    + b"\r\n"
                )

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/remote-frame")
def get_latest_remote_frame_status(include_preview: bool = True):
    """Polling endpoint for laptop dashboard to inspect live camera status and latest detection."""
    raw_state = latest_remote_frame.get("stream_state") or "disconnected"
    last_hb = latest_remote_frame.get("last_heartbeat")
    seconds_since = None
    effective_state = raw_state

    if last_hb:
        try:
            elapsed = (datetime.utcnow() - datetime.fromisoformat(last_hb)).total_seconds()
            seconds_since = round(elapsed, 1)
            if raw_state == "streaming":
                if elapsed > 12:
                    effective_state = "disconnected"
                elif elapsed > 4:
                    effective_state = "reconnecting"
            elif raw_state in ("connected", "paused") and elapsed > 45:
                effective_state = "disconnected"
        except Exception:
            pass
    elif raw_state != "disconnected":
        effective_state = "disconnected"

    preview = None
    if include_preview and latest_remote_frame.get("image_bytes"):
        preview = latest_remote_frame.get("preview_base64")
        if not preview:
            preview = f"data:image/jpeg;base64,{base64.b64encode(latest_remote_frame['image_bytes']).decode('utf-8')}"

    return {
        "has_frame": latest_remote_frame["image_bytes"] is not None,
        "frame_id": latest_remote_frame["frame_id"],
        "timestamp": latest_remote_frame["timestamp"],
        "device_info": latest_remote_frame["device_info"],
        "consumed": latest_remote_frame["consumed"],
        "preview_base64": preview,
        "detection": latest_remote_frame.get("detection"),
        "stream_state": effective_state,
        "raw_stream_state": raw_state,
        "stream_mode": latest_remote_frame.get("stream_mode") or "snapshot",
        "sender_username": latest_remote_frame.get("sender_username"),
        "sender_name": latest_remote_frame.get("sender_name"),
        "seconds_since_last_seen": seconds_since,
    }


@router.post("/process-remote-frame", response_model=ANPRDetectResponse)
def process_latest_remote_frame(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """Processes the latest frame received from the phone camera through the ANPR model."""
    global latest_remote_frame
    if not latest_remote_frame["image_bytes"]:
        raise HTTPException(status_code=400, detail="No frame has been captured from phone camera yet.")

    latest_remote_frame["consumed"] = True

    # Check if we already cached the detection during upload
    cached = latest_remote_frame.get("detection")
    if cached and cached.get("detected_plate"):
        detected_plate = cached["detected_plate"]
        clean_detected = normalize_plate_string(detected_plate)

        matching_pass = None
        all_passes = db.query(VisitorPass).all()
        for p in all_passes:
            if p.vehicle_number and normalize_plate_string(p.vehicle_number) == clean_detected:
                matching_pass = p
                if p.status in [PassStatus.not_inside, PassStatus.in_campus, PassStatus.approved]:
                    break

        pass_found = matching_pass is not None
        message = (
            f"Phone snapshot processed. Plate {detected_plate} detected. Active Visitor Pass found (#{matching_pass.id if matching_pass else ''})."
            if pass_found
            else f"Phone snapshot processed. Plate {detected_plate} detected. No active pre-approved pass found."
        )

        return ANPRDetectResponse(
            success=True,
            detected_plate=detected_plate,
            confidence=cached["confidence"],
            processing_time_ms=cached["processing_time_ms"],
            model_name=cached["model_name"],
            message=message,
            plate_image_data=cached.get("plate_image_data") or latest_remote_frame.get("preview_base64"),
            pass_found=pass_found,
            visitor_pass=matching_pass,
        )

    # Otherwise run inference directly
    inference_result = run_anpr_inference(image_bytes=latest_remote_frame["image_bytes"])
    detected_plate = inference_result["plate"]
    clean_detected = normalize_plate_string(detected_plate)

    if not detected_plate:
        return ANPRDetectResponse(
            success=False,
            detected_plate="",
            confidence=0.0,
            processing_time_ms=inference_result["processing_time_ms"],
            model_name=inference_result["model_name"],
            message="No vehicle license plate detected in the phone photo. Please take a closer snapshot of the license plate.",
            plate_image_data=latest_remote_frame.get("preview_base64"),
            pass_found=False,
            visitor_pass=None,
        )

    matching_pass = None
    all_passes = db.query(VisitorPass).all()
    for p in all_passes:
        if p.vehicle_number and normalize_plate_string(p.vehicle_number) == clean_detected:
            matching_pass = p
            if p.status in [PassStatus.not_inside, PassStatus.in_campus, PassStatus.approved]:
                break

    pass_found = matching_pass is not None
    message = (
        f"Phone frame processed. Plate {detected_plate} detected. Active Visitor Pass found (#{matching_pass.id if matching_pass else ''})."
        if pass_found
        else f"Phone frame processed. Plate {detected_plate} detected. No active pre-approved pass found."
    )

    return ANPRDetectResponse(
        success=True,
        detected_plate=detected_plate,
        confidence=inference_result["confidence"],
        processing_time_ms=inference_result["processing_time_ms"],
        model_name=inference_result["model_name"],
        message=message,
        plate_image_data=inference_result.get("preview_base64") or latest_remote_frame.get("preview_base64"),
        pass_found=pass_found,
        visitor_pass=matching_pass,
    )


@router.post("/fetch-url-frame", response_model=ANPRDetectResponse)
def fetch_ip_stream_frame(
    stream_url: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """
    Fetches image frame directly from an IP Webcam app or RTSP/HTTP snapshot stream
    running on the phone (e.g. http://192.168.1.5:8080/shot.jpg).
    """
    if not stream_url.startswith("http://") and not stream_url.startswith("https://"):
        stream_url = "http://" + stream_url

    try:
        req = urllib.request.Request(
            stream_url,
            headers={"User-Agent": "VVAS-ANPR-Terminal/2.0"}
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            image_bytes = response.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch snapshot from Phone IP camera ({e}). Ensure phone is on same Wi-Fi.")

    inference_result = run_anpr_inference(image_bytes=image_bytes)
    detected_plate = inference_result["plate"]
    clean_detected = normalize_plate_string(detected_plate)

    if not detected_plate:
        return ANPRDetectResponse(
            success=False,
            detected_plate="",
            confidence=0.0,
            processing_time_ms=inference_result["processing_time_ms"],
            model_name=inference_result["model_name"],
            message="No vehicle license plate detected in the IP camera snapshot.",
            plate_image_data=inference_result.get("preview_base64"),
            pass_found=False,
            visitor_pass=None,
        )

    matching_pass = None
    all_passes = db.query(VisitorPass).all()
    for p in all_passes:
        if p.vehicle_number and normalize_plate_string(p.vehicle_number) == clean_detected:
            matching_pass = p
            if p.status in [PassStatus.not_inside, PassStatus.in_campus, PassStatus.approved]:
                break

    pass_found = matching_pass is not None

    return ANPRDetectResponse(
        success=True,
        detected_plate=detected_plate,
        confidence=inference_result["confidence"],
        processing_time_ms=inference_result["processing_time_ms"],
        model_name=inference_result["model_name"],
        message=f"Phone IP stream frame processed: {detected_plate} detected.",
        plate_image_data=inference_result.get("preview_base64"),
        pass_found=pass_found,
        visitor_pass=matching_pass,
    )


@router.get("/activity-records")
def get_anpr_activity_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """
    Returns recent vehicle access logs with full detail columns including
    Pass ID, Vehicle Plate, Visitor Name, Purpose of Visit, Host Resident, Flat Number.
    """
    logs = (
        db.query(AccessLog)
        .order_by(AccessLog.timestamp.desc())
        .limit(20)
        .all()
    )

    records = []
    for log in logs:
        vp = log.visitor_pass
        res = vp.resident if vp else None
        guard = log.guard
        records.append({
            "log_id": log.id,
            "pass_id": vp.id if vp else None,
            "action": log.action,
            "timestamp": log.timestamp.isoformat(),
            "vehicle_number": vp.vehicle_number if vp else "—",
            "visitor_name": vp.visitor_name if vp else "—",
            "purpose": vp.purpose if vp else "—",
            "resident_name": res.full_name if res else "—",
            "flat_number": res.flat_number if res else "Gate",
            "guard_name": guard.full_name if guard else "Guard",
            "status": vp.status if vp else "exited",
        })

    return records


@router.get("/sample-vehicles")
def get_sample_vehicles_for_testing(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("guard", "admin")),
):
    """
    Returns registered vehicle plates with active passes for quick testing of ANPR in UI.
    """
    passes = db.query(VisitorPass).filter(VisitorPass.vehicle_number.isnot(None)).order_by(VisitorPass.id.desc()).limit(10).all()
    sample_list = []
    seen = set()

    for p in passes:
        if p.vehicle_number and p.vehicle_number not in seen:
            seen.add(p.vehicle_number)
            sample_list.append({
                "pass_id": p.id,
                "vehicle_number": p.vehicle_number,
                "visitor_name": p.visitor_name,
                "status": p.status,
                "purpose": p.purpose or "Visit",
                "resident_name": p.resident.full_name if p.resident else "Host",
                "flat_number": p.resident.flat_number if p.resident else "Gate",
            })

    # Add default fallback plates if database has fewer
    defaults = [
        {"vehicle_number": "MH14DX5842", "visitor_name": "Suresh Kumar", "purpose": "Guest Visit"},
        {"vehicle_number": "DL2CAY3188", "visitor_name": "Aarav Sharma", "purpose": "Meeting"},
        {"vehicle_number": "KA01AB1234", "visitor_name": "Priya Nair", "purpose": "Delivery"},
        {"vehicle_number": "MH12DE1433", "visitor_name": "Ramesh Kumar", "purpose": "Grocery & Parcel"},
    ]
    for d in defaults:
        if d["vehicle_number"] not in seen:
            sample_list.append({
                "pass_id": None,
                "vehicle_number": d["vehicle_number"],
                "visitor_name": d["visitor_name"],
                "status": "not_inside",
                "purpose": d["purpose"],
                "resident_name": "Resident Host",
                "flat_number": "A-101",
            })

    return sample_list[:6]
