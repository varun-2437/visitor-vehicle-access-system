from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from database import get_db
from models import User
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# ─── Password Hashing (bcrypt) ───
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── OAuth2 scheme ───
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Decode JWT token and return the current user. Raises 401 if invalid."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def require_role(*roles: str):
    """Dependency factory that checks if the current user has one of the allowed roles."""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(roles)}",
            )
        return current_user
    return role_checker

from fastapi import Security, Request
from fastapi.security.api_key import APIKeyHeader
import hashlib
from models import HardwareAPIKey

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def get_hardware_or_guard(
    request: Request,
    api_key: Optional[str] = Security(api_key_header),
    db: Session = Depends(get_db)
):
    """
    Allow access if EITHER a valid Hardware API Key is provided
    OR a valid user token (guard/admin) is provided.
    """
    # 1. Try Hardware API Key First
    if api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        hw_key = db.query(HardwareAPIKey).filter(HardwareAPIKey.key_hash == key_hash, HardwareAPIKey.is_active == True).first()
        if hw_key:
            return {"type": "hardware", "id": hw_key.id}
    
    # 2. Fall back to JWT Token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            user = get_current_user(token, db)
            if user.role in ["guard", "admin"]:
                return {"type": "user", "user": user}
        except HTTPException:
            pass # token invalid
            
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid Guard/Admin token or Hardware API Key required",
    )
