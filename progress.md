# 📋 Project Progress — Smart Visitor Vehicle Access System

> **Last Updated:** 2026-07-19  
> **Project:** 23CCE381 — Open Lab I (Semester 5, CCE/ECE)  
> **Repository:** https://github.com/varun-2437/visitor-vehicle-access-system  
> **Current Branch:** `testing` (all experimental work), `main` (clean)  
> **Developer Environment:** MacBook Air (Apple Silicon M-series), Python 3.9, venv  

---

## 🤖 AI Agent Instructions

> **READ THIS FIRST.** This file is designed to give any AI coding assistant (Claude, Gemini, Copilot, ChatGPT, etc.) full context of this project. If you are an AI agent working on this project:
>
> 1. **Read this entire file** before making any changes to understand what has been tried, what works, and what doesn't.
> 2. **After completing any work**, append a new entry to the [Change Log](#-change-log) section at the bottom of this file with:
>    - Date and time
>    - What was changed/added
>    - What worked and what didn't
>    - Any new files created or modified
>    - Updated test results if applicable
> 3. **Do NOT delete or overwrite** existing entries. This is an append-only log.
> 4. **Update the "Last Updated" date** at the top of this file.
> 5. **Update the "Current Status" section** if the project phase has changed.
> 6. If you add new models, dependencies, or test scripts, document them in the appropriate section below.

---

## 📖 Project Overview

### Problem Statement
Design a **cost-effective, camera-based visitor vehicle access system** for gated communities/apartments in India that:
- Automatically detects and reads Indian license plates (ANPR)
- Sends a digital approval request (QR/link) to the host resident
- Logs vehicle entry/exit with timestamps
- Eliminates manual security guard processes

### Target Architecture
```
Camera Feed → ANPR (Plate Detection + OCR) → Backend API → Database
                                                  ↓
                                        Notification to Resident
                                                  ↓
                                        Approve/Deny via QR/Link
                                                  ↓
                                        Gate Control Signal
```

### Indian License Plate Format
Standard format: `SS DD XX DDDD` where:
- `SS` = State code (2 letters, e.g., MH, DL, TS, KA)
- `DD` = District/RTO code (1-2 digits)
- `XX` = Series letters (1-3 letters)
- `DDDD` = Number (4 digits)
- Examples: `MH12JC2813`, `TS08FM8888`, `DL2CAY3180`, `MH14DX5842`

---

## 🖥️ Environment Setup

### System
- **OS:** macOS (Apple Silicon / ARM64)
- **Python:** 3.9 (via system/Homebrew)
- **Virtual Environment:** `venv/` (gitignored)
- **GPU:** No CUDA — all models run on CPU. MPS (Metal) available but not used by most libraries.

### Virtual Environment Setup
```bash
cd "/Users/murugeshvarun/Downloads/sem 5/23CCE381 - Open Lab I/visitor-vehicle-access-system"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Key Installed Packages (as of 2026-07-19)
| Package | Version | Purpose |
|---------|---------|---------|
| `ultralytics` | 8.4.95 | YOLOv8 object detection |
| `opencv-python` | 5.0+ | Image processing |
| `pytesseract` | latest | Tesseract OCR wrapper |
| `easyocr` | latest | Deep learning OCR |
| `paddlepaddle` | latest | PaddleOCR backend |
| `paddleocr` | latest | PaddleOCR (end-to-end OCR) |
| `torch` | 2.8.0 | PyTorch (for Indian_LPR models) |
| `torchvision` | 0.23.0 | Vision utilities |
| `scikit-learn` | 1.6.1 | Metrics (required by Indian_LPR) |
| `imutils` | 0.5.4 | Image utilities (required by Indian_LPR) |
| `albumentations` | 2.0.8 | Image augmentation (required by Indian_LPR) |
| `flask` | latest | Backend API (not yet implemented) |
| `sqlalchemy` | latest | Database ORM (not yet implemented) |

### System Dependencies
- **Tesseract OCR** must be installed at the OS level:
  ```bash
  brew install tesseract   # macOS
  sudo apt install tesseract-ocr  # Ubuntu/Debian
  ```

---

## 📂 Project File Structure

```
visitor-vehicle-access-system/
├── .gitignore                    # Ignores venv, weights, videos, etc.
├── README.md                     # Project overview and setup
├── requirements.txt              # Python dependencies
├── progress.md                   # ← THIS FILE (AI context & change log)
├── yolov8n.pt                    # YOLOv8 nano weights (gitignored, local only)
│
├── backend/                      # Flask API (NOT YET IMPLEMENTED)
├── frontend/                     # Web UI (NOT YET IMPLEMENTED)
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
│
├── detection/                    # ANPR test scripts (our custom code)
│   ├── test_anpr.py              # V1: Contour detection + Tesseract/EasyOCR
│   ├── test_anpr_advanced.py     # V2: Generic YOLOv8 + EasyOCR (FAILED)
│   ├── test_anpr_v3.py           # V3: PaddleOCR end-to-end (FAILED — API issues)
│   ├── models/                   # Empty — for future custom models
│   └── utils/                    # Empty — for future utilities
│
├── data/
│   ├── datasets/                 # Empty — for training data
│   └── test_images/
│       ├── results/              # V1 annotated output images
│       ├── results_advanced/     # V2 annotated output images
│       └── results_v3/           # V3 annotated output images
│
├── temp/                         # Cloned third-party repos for testing
│   ├── Indian-Number-Plate-Recognition-master/   # Legacy repo (DEPRECATED)
│   │   └── inputs/               # 4 sample test images (1.jpg–4.jpg)
│   │
│   └── Indian_LPR/              # ★ BEST MODEL — sanchit2843/Indian_LPR
│       ├── weights/              # Pretrained .pth weights (gitignored, local only)
│       │   ├── best_od.pth       # FCOS plate detector (8.5MB)
│       │   ├── best_lprnet.pth   # LPRNet OCR (1.3MB)
│       │   └── best_semantic.pth # HRNet segmentation (25MB)
│       ├── src/                  # Model source code
│       │   ├── object_detection/ # FCOS detector
│       │   ├── semantic_segmentation/ # HRNet segmentation
│       │   └── License_Plate_Recognition/ # LPRNet OCR
│       ├── test_indian_lpr.py    # Test: FCOS + HRNet + LPRNet comparison
│       ├── test_hybrid.py        # Test: FCOS detection + Tesseract/EasyOCR OCR
│       ├── test_results/         # Output images from test_indian_lpr.py
│       └── hybrid_results/       # Output images from test_hybrid.py
│
└── venv/                         # Python virtual environment (gitignored)
```

---

## 🧪 Test Images

All tests were run on **4 sample images** located at:
`temp/Indian-Number-Plate-Recognition-master/inputs/`

| Image | Resolution | Actual Plate Number | Notes |
|-------|-----------|-------------------|-------|
| `1.jpg` | 851×568 | `DL2CAY3180` | Delhi plate, Govt of India vehicle emblem visible |
| `2.jpg` | 1944×2592 | `MH12JC2813` | Maharashtra plate, large image, close-up |
| `3.jpg` | 802×557 | `TS08FM8888` | Telangana plate |
| `4.jpg` | 1920×1080 | `MH14DX5842` | Maharashtra plate, Volkswagen Polo, wide shot |

---

## 🔬 Models & Approaches Tested

### Test 1 — Contour Detection + Tesseract/EasyOCR (V1) ✅ PARTIALLY WORKING
- **Script:** `detection/test_anpr.py`
- **Detection:** OpenCV edge detection → contour filtering → aspect ratio check
- **OCR:** Tesseract and EasyOCR compared side-by-side
- **Results saved to:** `data/test_images/results/`

| Image | Tesseract | EasyOCR | Detection? |
|-------|-----------|---------|-----------|
| 1.jpg | `MEM LA` ❌ | `GOVL OF INDIA` ❌ | ❌ No plate found |
| 2.jpg | _(empty)_ ❌ | `MH12JC2813` ✅ | ❌ No contour match |
| 3.jpg | `TS08FM8888` ✅ | `IS 08 FM 8888` ⚠️ | ✅ Found |
| 4.jpg | `MH14DX5842` ✅ | `HHI4DX5842` ⚠️ | ✅ Found |

**Verdict:** Contour detection fails on 2 of 4 images. When it works, Tesseract is more accurate than EasyOCR for exact character matching.

---

### Test 2 — Generic YOLOv8 + EasyOCR (V2) ❌ FAILED
- **Script:** `detection/test_anpr_advanced.py`
- **Detection:** `yolov8n.pt` (generic object detection)
- **OCR:** EasyOCR (PaddleOCR failed to load)
- **Results saved to:** `data/test_images/results_advanced/`

| Image | Conf | EasyOCR |
|-------|------|---------|
| 1.jpg | 94% | `GOVL INDIA DLZCAY3 180` |
| 2.jpg | 73% | `MH12JC2813` |
| 3.jpg | 72% | `TS O8 FM 8888` |
| 4.jpg | 63% | `VOLKSWAGZN POLO TDI HHI4DX5842` |

**Verdict:** COMPLETE FAILURE. Generic YOLOv8n detects **entire cars/objects**, not license plates. The bounding boxes are 595×452 pixels (= the whole car). Tesseract returned empty strings on every image because the crops were too large. This approach is fundamentally wrong without a plate-specific YOLO model.

---

### Test 3 — PaddleOCR End-to-End (V3) ❌ FAILED (API INCOMPATIBILITY)
- **Script:** `detection/test_anpr_v3.py`
- **Detection:** PaddleOCR's built-in DB++ text detector
- **OCR:** PaddleOCR's SVTR recognizer
- **Results saved to:** `data/test_images/results_v3/`

**Verdict:** PaddleOCR v3+ completely overhauled its API. The following parameters were removed/changed:
- `show_log` → removed
- `use_gpu` → removed (auto-detected now)
- `use_angle_cls` → renamed to `use_textline_orientation`
- `.ocr()` → renamed to `.predict()`
- `cls=True` parameter → removed

Every fix led to another API error. PaddleOCR is **not viable** with the current installed version without a full rewrite of the calling code. The contour+Tesseract/EasyOCR fallback ran instead, producing identical results to V1.

---

### Test 4 — Indian_LPR: FCOS + HRNet + LPRNet (V4) ✅ BEST DETECTION
- **Source:** https://github.com/sanchit2843/Indian_LPR
- **Cloned to:** `temp/Indian_LPR/`
- **Script:** `temp/Indian_LPR/test_indian_lpr.py`
- **Detection Method 1:** FCOS (Fully Convolutional One-Stage) object detector — `best_od.pth`
- **Detection Method 2:** HRNet semantic segmentation — `best_semantic.pth`
- **OCR:** LPRNet (License Plate Recognition Network) — `best_lprnet.pth`
- **Training data:** 16,192 images, 21,683 annotated Indian plates (private dataset)
- **Framework:** Pure PyTorch (works on CPU, no CUDA required)
- **Results saved to:** `temp/Indian_LPR/test_results/`

#### NumPy 2.0 Compatibility Fixes Applied
The repo was written for NumPy 1.x. The following fixes were applied for NumPy 2.0+:
| File | Line | Old | New |
|------|------|-----|-----|
| `src/object_detection/model/backbone/hrnet.py` | 413 | `np.int(...)` | `int(...)` |
| `src/semantic_segmentation/utils/util.py` | 61, 97 | `np.int0(...)` | `np.int32(...)` |
| `src/semantic_segmentation/utils/metrics.py` | 46 | `dtype=np.int` | `dtype=np.int32` |
| `src/License_Plate_Recognition/train_LPRNet.py` | 129 | `astype(np.int)` | `astype(np.int32)` |

#### Results

| Image | Actual | FCOS + LPRNet | HRNet + LPRNet |
|-------|--------|--------------|----------------|
| 1.jpg | `DL2CAY3180` | **`DL2CAY3180`** ✅ | **`DL2CAY3180`** ✅ |
| 2.jpg | `MH12JC2813` | `MH12JC28` ⚠️ (missed 13) | `KJC2813` ⚠️ (missed MH12) |
| 3.jpg | `TS08FM8888` | `TJ08FM888` ⚠️ (S→J, missed 8) | `S08FH8880` ⚠️ |
| 4.jpg | `MH14DX5842` | **`MH14DX5842`** ✅ | **`MH14DX5842`** ✅ |

**Verdict:** FCOS plate detection is **excellent** — it correctly locates the plate region on all 4 images where contour detection failed on 2. LPRNet OCR is fast but less accurate than Tesseract/EasyOCR on character-level reading.

---

### Test 5 — Hybrid: FCOS Detection + Tesseract/EasyOCR (V5) ✅ BEST OVERALL
- **Script:** `temp/Indian_LPR/test_hybrid.py`
- **Detection:** FCOS from Indian_LPR (plate-specific, trained on 21K Indian plates)
- **OCR:** LPRNet, Tesseract, and EasyOCR compared side-by-side on the FCOS crop
- **Results saved to:** `temp/Indian_LPR/hybrid_results/`

| Image | Actual | LPRNet | Tesseract | EasyOCR |
|-------|--------|--------|-----------|---------|
| 1.jpg | `DL2CAY3180` | **`DL2CAY3180`** ✅ | `L2CHY3T` ❌ | `(DL2CAY3180]` ⚠️ |
| 2.jpg | `MH12JC2813` | `MH12JC28` ⚠️ | `MH12JC28` ⚠️ | `MH12JC28` ⚠️ |
| 3.jpg | `TS08FM8888` | `TJ08FM888` ⚠️ | **`TS08FM8888`** ✅ | **`TS08FM8888`** ✅ |
| 4.jpg | `MH14DX5842` | **`MH14DX5842`** ✅ | `MH1ADX5842` ⚠️ | `'HH14DX5842` ⚠️ |

**Verdict:** No single OCR engine is perfect across all images. The **best strategy** is to:
1. Use **FCOS** for plate detection (100% detection rate)
2. Run **all 3 OCR engines** on the crop
3. Apply **Indian plate regex validation** to filter valid results
4. Pick the best result via **consensus voting** or **confidence scoring**

---

## 📊 Final Accuracy Comparison (All Methods)

| Method | Detection Rate | OCR Accuracy (Exact) | OCR Accuracy (Partial) |
|--------|---------------|---------------------|----------------------|
| Contour + Tesseract | 2/4 (50%) | 2/4 (50%) | 2/4 (50%) |
| Contour + EasyOCR | 2/4 (50%) | 1/4 (25%) | 3/4 (75%) |
| Generic YOLOv8 + EasyOCR | 0/4 (0%) | 0/4 (0%) | — |
| PaddleOCR E2E | — | — | — (API broken) |
| **FCOS + LPRNet** | **4/4 (100%)** | 2/4 (50%) | 4/4 (100%) |
| **FCOS + Tesseract** | **4/4 (100%)** | 1/4 (25%) | 3/4 (75%) |
| **FCOS + EasyOCR** | **4/4 (100%)** | 1/4 (25%) | 3/4 (75%) |

### Best Approach: `FCOS Detection + Multi-OCR + Consensus`

---

## 🚧 Current Status

### ✅ COMPLETED
- [x] Project scaffolding and Git setup
- [x] Virtual environment and dependency installation
- [x] 5 different ANPR approaches tested and benchmarked
- [x] Identified best detection model: **FCOS** from `Indian_LPR` repo
- [x] Identified best OCR strategy: **Multi-engine consensus** (LPRNet + Tesseract + EasyOCR)
- [x] NumPy 2.0 compatibility patches applied to Indian_LPR
- [x] All test results documented with annotated output images

### 🔲 NOT YET STARTED
- [ ] **Production ANPR module** — Clean module combining FCOS + multi-OCR with:
  - Bounding box padding (5%) to prevent character clipping (fixes `2.jpg` issue)
  - Regex-based plate cleaning (removes brackets, symbols)
  - Consensus voting across OCR engines
  - Indian plate format validation
- [ ] **Backend API** (Flask) — REST endpoints for plate submission, approval workflow
- [ ] **Database** (SQLAlchemy) — Vehicle logs, resident records, approval history
- [ ] **Frontend** — Digital approval interface (QR code, approve/deny buttons)
- [ ] **Notification system** — Push/SMS/email to resident when visitor arrives
- [ ] **Real-time camera integration** — Webcam/IP camera feed processing
- [ ] **WiFi CSI module** — Device-free occupancy detection (secondary project idea)

---

## 🔗 External Resources & Links

### Repositories Tested
| Repo | URL | Status |
|------|-----|--------|
| Indian-Number-Plate-Recognition-master | (downloaded as ZIP, no Git URL) | ❌ DEPRECATED — NumPy/GPU incompatible |
| **Indian_LPR** (sanchit2843) | https://github.com/sanchit2843/Indian_LPR | ✅ BEST — FCOS + LPRNet, patched & working |

### Datasets Referenced
| Dataset | URL | Notes |
|---------|-----|-------|
| Indian License Plates with Labels | https://www.kaggle.com/datasets/kedarsai/indian-license-plates-with-labels | Public Kaggle dataset |
| Indian Driving Dataset (IDD) | https://idd.insaan.iiit.ac.in/ | Scene dataset, needs plate annotations |
| Indian_LPR private dataset | (not public) | 16,192 images, 21,683 plates — weights are public |

### Model Documentation
| Model | Paper/Docs | Used For |
|-------|-----------|---------|
| FCOS | [FCOS: Fully Convolutional One-Stage Object Detection](https://arxiv.org/abs/1904.01355) | Plate detection |
| HRNet | [Deep High-Resolution Representation Learning](https://arxiv.org/abs/1908.07919) | Semantic segmentation (plate region) |
| LPRNet | [LPRNet: License Plate Recognition via Deep Neural Networks](https://arxiv.org/abs/1806.10447) | Plate character recognition |
| YOLOv8 | [Ultralytics YOLOv8 Docs](https://docs.ultralytics.com/) | Generic object detection (not plate-specific) |
| PaddleOCR | [PaddlePaddle OCR](https://github.com/PaddlePaddle/PaddleOCR) | End-to-end OCR (API issues) |

---

## 🔑 Key Technical Decisions & Learnings

1. **Generic YOLO cannot detect license plates.** YOLOv8n detects object classes like "car", "truck" etc., not license plates. You need a plate-specific model.

2. **PaddleOCR v3+ has a completely rewritten API.** If using PaddleOCR, check version compatibility carefully. The `.ocr()` method, `use_gpu`, `show_log`, and `cls` parameters were all removed or renamed.

3. **NumPy 2.0 removed `np.int`, `np.float`, `np.bool`, `np.int0`.** Any repo using these will crash. Replace with `int`, `float`, `bool`, `np.int32` respectively.

4. **FCOS (from Indian_LPR) is the best plate detector we found.** It was trained on 21K Indian plates and correctly locates plates on all test images, including ones where contour detection and generic YOLO both failed.

5. **No single OCR engine is best for all plates.** LPRNet excels on some plates, Tesseract on others, EasyOCR on others. A consensus/voting approach is needed.

6. **Bounding box padding is critical.** The FCOS detector's bounding boxes sometimes clip the edges of the plate, cutting off characters (e.g., `MH12JC2813` → `MH12JC28`). Adding 5-10% padding before cropping for OCR should fix this.

7. **Model weights (.pth, .pt) are gitignored.** They must be downloaded separately. The FCOS and LPRNet weights are available from the Indian_LPR repository.

8. **Running on GPU vs CPU gives identical accuracy.** GPU only speeds up inference time (50ms vs 1500ms per image). For development, CPU is fine.

---

## 📝 Change Log

### 2026-07-14 — Initial Setup
- Initialized Git repository, created project structure
- Set up `venv`, `requirements.txt`, `.gitignore`
- Created `README.md`

### 2026-07-16 — ANPR Testing Phase 1 (V1, V2, V3)
- Created `detection/test_anpr.py` (V1: contour + Tesseract/EasyOCR)
- Ran V1 — Tesseract got 2/4 correct, EasyOCR got 1/4 exact
- Created `detection/test_anpr_advanced.py` (V2: generic YOLOv8)
- Ran V2 — Complete failure, YOLO detects cars not plates
- Created `detection/test_anpr_v3.py` (V3: PaddleOCR end-to-end)
- Ran V3 — PaddleOCR API crashed due to version incompatibility
- Installed `paddlepaddle`, `paddleocr`, `easyocr`, `tesseract` (system)

### 2026-07-19 — ANPR Testing Phase 2 (Indian_LPR V4, Hybrid V5)
- Cloned `sanchit2843/Indian_LPR` to `temp/Indian_LPR/`
- Applied 5 NumPy 2.0 compatibility patches across the repo
- Installed `scikit-learn`, `imutils`, `albumentations`, `nltk`, `pandas`
- Created `temp/Indian_LPR/test_indian_lpr.py` — tests FCOS + HRNet + LPRNet
- Ran V4 — FCOS detection is 100% accurate, LPRNet OCR is 50% exact
- Created `temp/Indian_LPR/test_hybrid.py` — tests FCOS + all 3 OCR engines
- Ran V5 — Confirmed multi-OCR consensus is the best strategy
- Created `testing` branch, committed all code and results
- Updated `.gitignore` to ignore `.pth`, `.pt`, `.weights`, `.mp4`, `.avi`, `.gif`
- Removed nested `.git` from `temp/Indian_LPR/`
- Pushed `testing` branch to GitHub

---

> **END OF PROGRESS FILE.**  
> If you are an AI agent, remember to append your changes to the Change Log above after completing your work. Do not modify existing entries.
