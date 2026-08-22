# Smart Visitor Vehicle Access System

Camera-based visitor vehicle access system with automatic plate recognition (ANPR) and QR-based digital approval workflow.

---

## 🔑 Default Credentials

The system seeds a default Admin account on startup. Additional users can be created from the Admin Dashboard.

| Role | Username | Password | Notes / Dashboard Route |
|------|----------|----------|-------------------------|
| **Admin** | `admin` | `admin123` | Full access (`/admin`) — User management & access logs |
| **Resident** | `varun` | `pass123` | Resident access (`/resident`) — Generate visitor QR passes |
| **Security Guard** | `guard1` | `pass123` | Guard access (`/guard`) — Camera/manual QR scanner |

---

## 🚀 Running the Application

### 1. Backend (FastAPI)
```bash
# Activate virtual environment
source venv/bin/activate   # On macOS/Linux
# venv\Scripts\activate    # On Windows

# Start backend server
cd backend
uvicorn main:app --port 8000 --reload
```
- **Backend API URL:** `http://localhost:8000`
- **Interactive API Docs (Swagger):** `http://localhost:8000/docs`

### 2. Frontend (React + Vite)
```bash
cd frontend
npm run dev
```
- **Frontend App URL:** `http://localhost:5173`

---

## 🏗️ Project Architecture

- **Backend:** FastAPI (Python), SQLite database with SQLAlchemy ORM, Bcrypt password hashing, JWT authentication.
- **Frontend:** React + Vite, CSS dark theme, Camera QR scanner via `html5-qrcode`.
- **ANPR AI Engine:** FCOS plate detector + Multi-OCR Consensus (LPRNet + Tesseract + EasyOCR).

---

## 📖 Documentation
- [`progress.md`](progress.md) — Comprehensive living context & technical decision log
- [`Total_progress.md`](Total_progress.md) — Executive progress summary

