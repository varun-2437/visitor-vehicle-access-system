import os
from pathlib import Path

# ─── Base Paths ───
BASE_DIR = Path(__file__).resolve().parent
QR_CODES_DIR = BASE_DIR / "qr_codes"
QR_CODES_DIR.mkdir(exist_ok=True)

# ─── Database ───
DATABASE_URL = f"sqlite:///{BASE_DIR / 'app.db'}"

# ─── JWT Settings ───
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# ─── CORS ───
CORS_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "null",                     # Local file:// HTML files
    "*",
]

# ─── Default Admin ───
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"
