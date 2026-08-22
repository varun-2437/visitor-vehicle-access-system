import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base
import enum


# ─── Enums ───
class UserRole(str, enum.Enum):
    admin = "admin"
    resident = "resident"
    guard = "guard"


class PassStatus(str, enum.Enum):
    not_inside = "not_inside"  # Pass Created (Not Inside)
    in_campus = "in_campus"    # Vehicle In Campus
    exited = "exited"          # Vehicle Exited Campus
    expired = "expired"        # Pass Expired
    # Legacy aliases
    approved = "not_inside"
    used = "in_campus"



class LogAction(str, enum.Enum):
    entry = "entry"
    exit = "exit"


# ─── User Model ───
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.resident)
    flat_number = Column(String(20), nullable=True)  # Only for residents
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    visitor_passes = relationship("VisitorPass", back_populates="resident", foreign_keys="VisitorPass.resident_id")


# ─── Visitor Pass Model ───
class VisitorPass(Base):
    __tablename__ = "visitor_passes"

    id = Column(Integer, primary_key=True, index=True)
    visitor_name = Column(String(100), nullable=False)
    vehicle_number = Column(String(20), nullable=True)
    purpose = Column(String(200), nullable=True)
    resident_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    qr_token = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    status = Column(SAEnum(PassStatus), default=PassStatus.approved)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    qr_image_path = Column(String(255), nullable=True)

    # Relationships
    resident = relationship("User", back_populates="visitor_passes", foreign_keys=[resident_id])
    access_logs = relationship("AccessLog", back_populates="visitor_pass")


# ─── Access Log Model ───
class AccessLog(Base):
    __tablename__ = "access_logs"

    id = Column(Integer, primary_key=True, index=True)
    visitor_pass_id = Column(Integer, ForeignKey("visitor_passes.id"), nullable=False)
    scanned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(SAEnum(LogAction), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    visitor_pass = relationship("VisitorPass", back_populates="access_logs")
    guard = relationship("User", foreign_keys=[scanned_by])
