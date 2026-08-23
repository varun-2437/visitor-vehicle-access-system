from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# ─── Auth Schemas ───
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    role: str = "resident"
    flat_number: Optional[str] = None
    is_approved: bool = True
    approval_status: str = "approved"


class UserLogin(BaseModel):
    username: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    flat_number: Optional[str] = None
    is_approved: bool = True
    approval_status: str = "approved"
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Visitor Pass Schemas ───
class VisitorPassCreate(BaseModel):
    visitor_name: str
    vehicle_number: Optional[str] = None
    purpose: Optional[str] = None
    hours_valid: int = 24  # Default 24 hours


class VisitorPassResponse(BaseModel):
    id: int
    visitor_name: str
    vehicle_number: Optional[str] = None
    purpose: Optional[str] = None
    qr_token: str
    status: str
    created_at: datetime
    expires_at: datetime
    qr_image_path: Optional[str] = None
    resident: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ─── QR Verify Schema ───
class QRVerifyRequest(BaseModel):
    qr_token: str
    action: str = "entry"  # "entry" or "exit"


class QRVerifyResponse(BaseModel):
    valid: bool
    message: str
    visitor_pass: Optional[VisitorPassResponse] = None


# ─── Access Log Schema ───
class AccessLogResponse(BaseModel):
    id: int
    action: str
    timestamp: datetime
    visitor_pass: Optional[VisitorPassResponse] = None
    guard: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ─── Manual Vehicle Entry Schema (Guard Panel) ───
class ManualVehicleEntryCreate(BaseModel):
    visitor_name: str
    vehicle_number: str
    purpose: Optional[str] = "Walk-in / Gate Register"
    flat_number: Optional[str] = None
    action: str = "entry"

