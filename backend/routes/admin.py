from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import User, AccessLog, UserRole
from schemas import UserResponse, AccessLogResponse, UserRejectRequest
from auth import require_role

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users. Admin only. Passwords are never exposed."""
    return db.query(User).order_by(User.id.asc()).all()


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Delete a user by ID. Admin only. Cannot delete self."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}


@router.put("/users/{user_id}/approve", response_model=UserResponse)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Approve a pending user registration. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_approved = True
    user.approval_status = "approved"
    user.rejection_reason = None
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/reject", response_model=UserResponse)
def reject_user(
    user_id: int,
    reject_data: Optional[UserRejectRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Reject a user registration request with optional rejection reason. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reason = reject_data.rejection_reason if reject_data and reject_data.rejection_reason else "Application details could not be verified by Admin."

    user.is_approved = False
    user.approval_status = "rejected"
    user.rejection_reason = reason
    db.commit()
    db.refresh(user)
    return user


@router.get("/logs", response_model=List[AccessLogResponse])
def list_access_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """View all access logs. Admin only."""
    logs = db.query(AccessLog).order_by(AccessLog.timestamp.desc()).limit(100).all()
    return logs
