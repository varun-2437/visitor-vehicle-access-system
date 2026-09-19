import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, HardwareAPIKey
from auth import require_role

router = APIRouter(prefix="/api/admin/api-keys", tags=["Hardware API Keys"])

# Helper to hash keys
def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()

@router.get("")
def list_api_keys(db: Session = Depends(get_db), current_admin: User = Depends(require_role("admin"))):
    keys = db.query(HardwareAPIKey).all()
    # Mask keys for display, only showing the description and active status
    return [
        {
            "id": key.id,
            "description": key.description,
            "is_active": key.is_active,
            "created_at": key.created_at,
            "created_by": key.created_by,
        }
        for key in keys
    ]

@router.post("")
def generate_api_key(
    data: dict, 
    db: Session = Depends(get_db), 
    current_admin: User = Depends(require_role("admin"))
):
    description = data.get("description")
    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    # Generate a secure random URL-safe text string
    raw_key = secrets.token_urlsafe(32)
    key_hash = hash_api_key(raw_key)

    new_key = HardwareAPIKey(
        description=description,
        key_hash=key_hash,
        is_active=True,
        created_by=current_admin.id
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    # Return the RAW key ONLY ONCE. It cannot be retrieved again.
    return {
        "id": new_key.id,
        "description": new_key.description,
        "api_key": raw_key,  # The frontend MUST display this to the user immediately
        "message": "Key generated successfully. Please copy it now. It will not be shown again."
    }

@router.delete("/{key_id}")
def revoke_api_key(
    key_id: int, 
    db: Session = Depends(get_db), 
    current_admin: User = Depends(require_role("admin"))
):
    key = db.query(HardwareAPIKey).filter(HardwareAPIKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API Key not found")
    
    db.delete(key)
    db.commit()
    return {"message": "API Key revoked and deleted"}
