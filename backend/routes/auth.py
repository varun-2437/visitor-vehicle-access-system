from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import UserCreate, UserLogin, UserResponse, Token, ChangePassword
from auth import hash_password, verify_password, create_access_token, get_current_user
from rate_limiter import login_rate_limiter, signup_rate_limiter

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse)
def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a new user. Only admins can create accounts."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Only admins can register new users")

    # Check for existing username or email
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    # Validate role
    if user_data.role not in [r.value for r in UserRole]:
        raise HTTPException(status_code=400, detail=f"Invalid role. Choose from: {[r.value for r in UserRole]}")

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        flat_number=user_data.flat_number,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/signup", response_model=UserResponse)
def signup_user(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    """Public self-registration for residents/guards. Account requires admin approval before login."""
    signup_rate_limiter.check_rate_limit(request)

    # Check if existing user with username/email was previously rejected. If so, remove old rejected record so they can sign up again cleanly!
    existing_user_by_name = db.query(User).filter(User.username == user_data.username).first()
    if existing_user_by_name:
        if existing_user_by_name.approval_status == "rejected":
            db.delete(existing_user_by_name)
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="Username already exists")

    existing_user_by_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_user_by_email:
        if existing_user_by_email.approval_status == "rejected":
            db.delete(existing_user_by_email)
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="Email already exists")

    if user_data.role not in [UserRole.resident.value, UserRole.guard.value]:
        raise HTTPException(status_code=400, detail="Public sign up is allowed for Residents and Guards only")

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        flat_number=user_data.flat_number,
        is_approved=False,
        approval_status="pending",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
def login(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return a JWT token. Rate limited to 5 attempts/min per IP."""
    login_rate_limiter.check_rate_limit(request)

    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # Enforce approval status checks
    if user.approval_status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account request was REJECTED by the Administrator. Please click 'Create Account' to sign up again from scratch.",
        )

    if user.approval_status == "pending" or not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin approval. Please contact the administrator to activate your account.",
        )

    token = create_access_token(data={"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return current_user


@router.put("/change-password")
def change_password(
    data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
