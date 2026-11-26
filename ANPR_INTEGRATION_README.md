# VVAS ANPR Model & Pipeline Integration Guide

This guide explains how the **Automatic Number Plate Recognition (ANPR)** module works in the Visitor Vehicle Access System (VVAS), what options exist in the Web & Mobile dashboards, and how to integrate a custom ANPR model and merge cleanly into this repository.

---

## 1. System Architecture (Database vs. ANPR AI Service)

| Layer | Responsibility | Where It Lives |
| :--- | :--- | :--- |
| **Database, Auth, Passes & Logs** | Users, roles, visitor passes, QR tokens/images, entry/exit logs, stats, hardware API keys | **Supabase PostgreSQL** (`https://dvwrtqhwzzwdgfanimnd.supabase.co`) via RPCs (`vvas_*`) |
| **Web Dashboard (`frontend/`)** | Resident, Guard, Admin portals + **ANPR Scanner Segment** | `npm run dev` connects directly to Supabase for data and to `:8000/api/anpr/*` for AI inference & live camera relay |
| **Android App (`android/`)** | Resident, Guard, Admin, and **GateCam** mobile streaming node | Connects directly to Supabase for data and streams live JPEG frames to `/api/anpr/remote-frame` |
| **ANPR Inference Server (`backend/`)** | Runs YOLOv9 / OCR plate detection, validates plate format, relays live frames (MJPEG + snapshots) | `backend/routes/anpr.py` (Python FastAPI on port `8000`) |

> **Important:** Do **not** depend on local `backend/app.db` (SQLite) for final integration—configure `DATABASE_URL` to point to **Supabase PostgreSQL** (or call Supabase RPCs `vvas_verify_qr` / `vvas_api_manual_entry` / `vvas_api_get_passes`) so ANPR detections check real live passes and write entry/exit logs straight to the online database.

---

## 2. Dashboard Options in the ANPR Tab (`ANPRScannerSegment.jsx`)

Located in `frontend/src/components/ANPRScannerSegment.jsx` (visible inside **Guard Dashboard** and **Admin Dashboard**):

### Top Header Controls
- **Live Mobile Connection Status Pill** (`disconnected` / `connected` / `streaming` / `paused`) — tracks the phone `gatecam` node heartbeat (`GET /api/anpr/remote-frame`).
- **Gate Action Toggle (`Vehicle Entry` vs. `Vehicle Exit`)** — chooses whether an auto-matched or manual detection logs an `entry` or an `exit`.

### 5 Camera Feed Input Modes
1. **Wireless Phone Camera (`phone_qr`)**
   - Displays a scannable pairing QR + LAN URL (`/phone-camera`) or accepts frames directly from the Android **GateCam** screen (`LiveCameraStreamFragment.kt`).
   - Polls `GET /api/anpr/remote-frame` (~650 ms) or renders MJPEG (`/api/anpr/mjpeg-feed`).
   - Toggle **Auto-Detect** runs `POST /api/anpr/process-remote-frame` on incoming frames automatically.
2. **Webcam / Continuity (`local_cam`)**
   - Enumerates local USB webcams, laptop cameras, or iPhone Continuity Camera via `navigator.mediaDevices`.
   - Captures a frame and sends it as `multipart/form-data` to `POST /api/anpr/detect-plate`.
3. **Phone IP Stream (`ip_stream`)**
   - Pulls JPEG snapshots from an IP Webcam / RTSP-HTTP bridge URL (e.g., `http://<phone-ip>:8080/shot.jpg`) via `POST /api/anpr/fetch-url-frame` (manual or 3.5 s auto-fetch).
4. **Upload Photo (`upload`)**
   - Lets the operator upload a `.jpg` / `.png` image file directly to `POST /api/anpr/detect-plate`.
5. **Simulator (`simulator`)**
   - Lists sample vehicles (`GET /api/anpr/sample-vehicles`) to test pass matching and entry/exit logging without a camera.

### Right Column & Activity Table
- **Detection Result & Pass Match Card:** Shows extracted plate text, confidence %, processing latency (ms), cropped plate preview (`plate_image_data`), and whether an active visitor pass was matched (`pass_found`).
- **Walk-in / Unregistered Override Form:** If `pass_found === false`, lets the guard type Visitor Name, Flat, and Purpose and log access via `POST /api/anpr/log-entry-exit`.
- **ANPR Activity Records Table:** Searchable & filterable (`All`, `Entry`, `Exit`) table populated by `GET /api/anpr/activity-records` with CSV export and printable gate pass modal.

---

## 3. Backend API Contract (`backend/routes/anpr.py`)

If you replace or upgrade the AI model inside `backend/routes/anpr.py`, keep these exact routes and JSON shapes so both the **Web Dashboard** and **Android GateCam** work without breaking:

### A. `POST /api/anpr/detect-plate`
- **Input:** `multipart/form-data` with `file` (JPEG/PNG image).
- **Output (`ANPRDetectResponse`):**
```json
{
  "success": true,
  "detected_plate": "TN42AE2578",
  "confidence": 0.94,
  "processing_time_ms": 84.5,
  "model_name": "Your-Custom-ANPR-Model",
  "message": "Detected plate TN42AE2578",
  "plate_image_data": "data:image/jpeg;base64,...",
  "pass_found": true
}
```

### B. `POST /api/anpr/remote-frame` & `GET /api/anpr/remote-frame`
- **Mobile Upload Input (`multipart/form-data`):** `file` (JPEG frame), `device_info`, `stream_mode` (`live_stream` / `snapshot`), `run_anpr` (`"true"` / `"false"`).
- **Mobile Upload Output:** Returns `frame_id`, `stream_state`, `detected_plate`, `confidence`, `processing_time_ms`, `model_name`, `pass_found`, `visitor_name`, `flat_number`, `pass_id`, `message`.
- **Web Poll Output (`GET /api/anpr/remote-frame`):** Latest `preview_base64`, `frame_id`, `stream_state`, `sender_username`, `device_info`, and latest `detection` object.

### C. `POST /api/anpr/stream-status`
- Updates connection state from mobile (`connected`, `streaming`, `paused`, `disconnected`).

### D. `POST /api/anpr/process-remote-frame` & `POST /api/anpr/fetch-url-frame`
- Runs the ANPR detector on the latest buffered remote phone frame or fetched IP-camera URL image and returns `ANPRDetectResponse`.

### E. `POST /api/anpr/log-entry-exit`
- Looks up active pass by `vehicle_number` (or creates a manual walk-in pass if missing), updates pass status (`in_campus` / `exited`), inserts into `access_logs`, and returns `QRVerifyResponse`:
  `{ "valid": true, "message": "...", "visitor_pass": { ... } }`.

---

## 4. Integrating Your Own ANPR Model (Step-by-Step)

1. **Create a feature branch from `anpr-app`:**
   ```bash
   git checkout anpr-app
   git pull origin anpr-app
   git checkout -b feat/custom-anpr-model
   ```
2. **Swap / Add Model Inference in `backend/routes/anpr.py`:**
   - Replace or wrap `alpr_model` (currently `fast_alpr` + `easyocr` fallback) with your custom detector + OCR pipeline (e.g., YOLO + PaddleOCR / TrOCR / EasyOCR).
   - **Keep Strict Plate Validation (`extract_valid_plate`):** Always filter OCR output through Indian RTO/BH plate regexes so background text (keyboards, signs, random strings) is rejected:
     - Standard RTO: `^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$` (e.g., `TN42AE2578`, `MH14DX5842`)
     - Bharat Series: `^\d{2}BH\d{4}[A-Z]{1,2}$` (e.g., `22BH1234AA`)
   - Optimize frame latency by resizing frames (e.g., max width 640–960 px) and returning base64 crop in `plate_image_data`.
3. **Connect Your ANPR Backend to Online Supabase (Not Local SQLite):**
   - Set `DATABASE_URL` in your environment before launching Uvicorn:
     ```bash
     export DATABASE_URL="postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.dvwrtqhwzzwdgfanimnd.supabase.co:5432/postgres"
     cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
     ```
   - Or invoke the existing Supabase REST RPCs directly (`POST https://dvwrtqhwzzwdgfanimnd.supabase.co/rest/v1/rpc/...` with `apikey`):
     - `vvas_api_get_passes` — check active passes for the detected plate
     - `vvas_verify_qr` / `vvas_mark_exit` / `vvas_api_manual_entry` — log entry/exit to Supabase
4. **Test End-to-End:**
   - Run Web Dashboard: `cd frontend && npm run dev`
   - Log in as Guard (`guard1` / `pass123`) or Admin (`admin` / `admin123`) → open **ANPR Plate Recognition (AI Model)**.
   - Test **Upload Photo**, **Webcam**, and **Android GateCam** live feed (`gatecam` / `gatecam123` on Android pointing server IP to your machine `:8000`).
5. **Merge Checklist:**
   - Ensure `backend/requirements.txt` includes any new Python packages (and keeps `psycopg2-binary`).
   - Do **not** modify Supabase RPC schemas unless coordinated.
   - Verify `cd frontend && npm run build` and `python3 -m py_compile backend/routes/anpr.py` pass with zero errors.
   - Open a PR / merge `feat/custom-anpr-model` into `anpr-app`.
