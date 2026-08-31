# 🧪 VMS Automated Test Suite & Service Status Checker

This directory contains the high-level automated test suite, live service health monitoring system, and component diagnostic runner for the **Visitor Vehicle Access System (VMS)**.

---

## 🌐 1. Interactive Web Diagnostic Dashboard (`tests/index.html`)

An interactive standalone HTML/JS webpage to monitor live infrastructure health, test each component individually, and execute end-to-end automated test suites.

### How to Open:
- **Directly in Browser:** Double-click [`tests/index.html`](file:///Users/murugeshvarun/Downloads/sem%205/23CCE381%20-%20Open%20Lab%20I/visitor-vehicle-access-system/tests/index.html) or open URL `file:///.../visitor-vehicle-access-system/tests/index.html` in Safari/Chrome.
- **Or via Local Server:** Open `http://localhost:8000/docs` or `http://localhost:5173`.

### Key Features:
1. **Live Infrastructure & Microservices Status Grid:**
   - Monitors **FastAPI Backend Server** (`http://localhost:8000`), **SQLite Database Engine**, **Vite Frontend Dev Server** (`http://localhost:5173`), and **QR Code Asset Generator Directory** (`/qr_codes/`).
   - Displays real-time status badges (🟢 **ONLINE**, 🟡 **WARNING**, 🔴 **OFFLINE**), latencies in milliseconds, and **Down Diagnostics Explanations** detailing root-cause failures if any service is down.
2. **Full Automated Diagnostic Test Execution:**
   - One-click **"Run Full Test Suite"** button with live progress tracking, pass/fail metrics, and response timing.
3. **Individual Component Testing:**
   - Test each component individually on demand (System Health, Auth & RBAC, Visitor Pass Generation, Gate Entry/Exit Scan Verification, Guard Terminal, Admin Operations).
4. **Diagnostic Log Console:**
   - Real-time color-coded payload trace log inspector with copy and clear log actions.

---

## 🐍 2. Terminal Test Runner CLI (`tests/run_tests.py`)

A standalone Python script to perform health checks and run component tests directly from the terminal shell.

### How to Run:
```bash
python3 tests/run_tests.py
```

---

## 📊 3. Tested System Components & Critical Aspects

| Component Suite | Tested Aspects & Functions |
|---|---|
| **1. Infrastructure & Services** | FastAPI ping (`GET /docs`), Frontend server ping (`GET http://localhost:5173`), CORS preflight configuration |
| **2. Authentication & RBAC** | Default Admin Sign In (`admin`/`admin123`), Invalid Password Rejection (401), Token Profile Fetch (`GET /api/auth/me`), Public Self-Signup (`POST /api/auth/signup`) |
| **3. Visitor Pass & QR Lifecycle** | Pass & QR Generation (`POST /api/qr/generate`), QR PNG Asset HTTP Serving (`/qr_codes/{file}.png`), Gate Entry Scan (`not_inside` ➔ `in_campus`), Duplicate Entry Block Check, Gate Exit Scan (`in_campus` ➔ `exited`) |
| **4. Guard Terminal** | Today's Approved Passes Feed (`GET /api/qr/today-passes`), Manual Vehicle Entry (`POST /api/qr/manual-entry`), Indian License Plate Regex Format Rules |
| **5. Admin Management** | User Directory Listing (`GET /api/admin/users`), User Approval Workflow (`PUT /api/admin/users/{id}/approve`), Access Logs Audit Trail (`GET /api/admin/logs`) |
