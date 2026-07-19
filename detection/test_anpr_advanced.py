"""
ANPR Advanced Test — YOLOv8 (Plate-Specific) + PaddleOCR vs Tesseract vs EasyOCR
Compares all OCR engines on the same images for accuracy benchmarking.
"""

import os
import sys
import time
import cv2
import numpy as np
from pathlib import Path

# ─── CONFIG ────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
INPUT_DIR = os.path.join(PROJECT_DIR, "temp", "Indian-Number-Plate-Recognition-master", "inputs")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "data", "test_images", "results_advanced")
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ─── OCR ENGINES ──────────────────────────────────────────────
def ocr_tesseract(plate_img):
    """Tesseract OCR with preprocessing"""
    import pytesseract
    gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    config = '--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return pytesseract.image_to_string(thresh, config=config).strip()


def ocr_easyocr(plate_img, reader):
    """EasyOCR"""
    results = reader.readtext(plate_img, detail=0, paragraph=True)
    return " ".join(results).strip().upper()


def ocr_paddleocr(plate_img, ocr_engine):
    """PaddleOCR — best for structured text like plates"""
    result = ocr_engine.ocr(plate_img, cls=True)
    if result and result[0]:
        texts = [line[1][0] for line in result[0] if line[1]]
        return " ".join(texts).strip().upper()
    return ""


# ─── MAIN ─────────────────────────────────────────────────────
def main():
    print("=" * 65)
    print("  ANPR Advanced Test — Plate-Specific YOLO + Multi-OCR Compare")
    print("=" * 65)

    # ── Step 1: Load plate-specific YOLOv8 model ──
    from ultralytics import YOLO
    print("\n[1/4] Loading YOLOv8 plate detection model...")

    plate_model = None
    model_name = ""

    # Try loading plate-specific model from HuggingFace
    try:
        plate_model = YOLO("keremberke/yolov8n-license-plate-detection")
        model_name = "YOLOv8n-license-plate (HuggingFace)"
        print(f"  ✓ Loaded: {model_name}")
    except Exception as e:
        print(f"  ⚠ HuggingFace model failed: {e}")
        # Fallback to generic YOLOv8
        plate_model = YOLO("yolov8n.pt")
        model_name = "YOLOv8n-generic (fallback)"
        print(f"  ✓ Loaded: {model_name}")

    # ── Step 2: Load PaddleOCR ──
    print("\n[2/4] Loading PaddleOCR...")
    paddle_engine = None
    try:
        from paddleocr import PaddleOCR
        paddle_engine = PaddleOCR(
            use_angle_cls=True,
            lang='en',
            show_log=False,
            use_gpu=False
        )
        print("  ✓ PaddleOCR loaded")
    except ImportError:
        print("  ✗ PaddleOCR not installed (pip install paddlepaddle paddleocr)")
    except Exception as e:
        print(f"  ✗ PaddleOCR error: {e}")

    # ── Step 3: Load EasyOCR + Tesseract ──
    print("\n[3/4] Loading other OCR engines...")

    easyocr_reader = None
    try:
        import easyocr
        easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        print("  ✓ EasyOCR loaded")
    except ImportError:
        print("  ⚠ EasyOCR not installed")

    tesseract_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_ok = True
        print("  ✓ Tesseract available")
    except Exception:
        print("  ⚠ Tesseract not found")

    # ── Step 4: Process images ──
    print(f"\n[4/4] Processing images from: {INPUT_DIR}")
    images = sorted([
        f for f in os.listdir(INPUT_DIR)
        if Path(f).suffix.lower() in IMAGE_EXTENSIONS
    ])

    if not images:
        print("  ✗ No images found!")
        sys.exit(1)

    print(f"  Found {len(images)} images: {images}")
    print(f"  Detection model: {model_name}\n")
    print("─" * 65)

    results_summary = []

    for img_name in images:
        img_path = os.path.join(INPUT_DIR, img_name)
        print(f"\n📷 Processing: {img_name}")
        print("-" * 45)

        img = cv2.imread(img_path)
        if img is None:
            print("  ✗ Failed to read image, skipping.")
            continue

        # ── YOLO Detection ──
        t_start = time.time()
        yolo_results = plate_model(img, verbose=False, conf=0.25)
        t_detect = time.time() - t_start

        detections = yolo_results[0].boxes
        print(f"  Detection time: {t_detect:.3f}s | Objects found: {len(detections)}")

        # Extract plate crops from YOLO detections
        plate_crops = []
        for box in detections:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            crop = img[y1:y2, x1:x2]
            if crop.size > 0:
                plate_crops.append((crop, x1, y1, x2 - x1, y2 - y1, conf, cls_id))

        # If no plates detected by YOLO, try contour-based fallback
        if not plate_crops:
            print("  ⚠ YOLO found no plates — trying contour fallback")
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray = cv2.bilateralFilter(gray, 11, 17, 17)
            edges = cv2.Canny(gray, 30, 200)
            contours, _ = cv2.findContours(edges.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

            for contour in contours:
                peri = cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, 0.018 * peri, True)
                if len(approx) == 4:
                    x, y, w, h = cv2.boundingRect(approx)
                    aspect_ratio = w / float(h)
                    if 1.5 <= aspect_ratio <= 6.0 and w > 60 and h > 15:
                        crop = img[y:y+h, x:x+w]
                        plate_crops.append((crop, x, y, w, h, 0.0, -1))
                        print("  ✓ Found plate via contour detection")
                        break

        if not plate_crops:
            print("  ✗ No plate region found at all")
            results_summary.append({
                "image": img_name, "tesseract": "—", "easyocr": "—", "paddleocr": "—"
            })
            continue

        # ── Run OCR on each plate crop ──
        for idx, (crop, x, y, w, h, conf, cls_id) in enumerate(plate_crops):
            result_entry = {
                "image": img_name,
                "conf": f"{conf:.0%}" if conf > 0 else "contour",
                "tesseract": "—",
                "easyocr": "—",
                "paddleocr": "—"
            }

            if conf > 0:
                print(f"  Plate #{idx+1} — conf: {conf:.2%} | bbox: ({x},{y},{w},{h})")
            else:
                print(f"  Plate #{idx+1} — via contour | bbox: ({x},{y},{w},{h})")

            # Tesseract
            if tesseract_ok:
                t = time.time()
                result_entry["tesseract"] = ocr_tesseract(crop)
                print(f"    Tesseract:  \"{result_entry['tesseract']}\" ({time.time()-t:.3f}s)")

            # EasyOCR
            if easyocr_reader:
                t = time.time()
                result_entry["easyocr"] = ocr_easyocr(crop, easyocr_reader)
                print(f"    EasyOCR:    \"{result_entry['easyocr']}\" ({time.time()-t:.3f}s)")

            # PaddleOCR
            if paddle_engine:
                t = time.time()
                result_entry["paddleocr"] = ocr_paddleocr(crop, paddle_engine)
                print(f"    PaddleOCR:  \"{result_entry['paddleocr']}\" ({time.time()-t:.3f}s)")

            results_summary.append(result_entry)

            # ── Save annotated image ──
            output_img = img.copy()
            color = (0, 255, 0) if conf > 0.5 else (0, 255, 255)
            cv2.rectangle(output_img, (x, y), (x + w, y + h), color, 3)

            # Use the best available OCR result as label
            label = result_entry["paddleocr"] or result_entry["tesseract"] or result_entry["easyocr"]
            if label and label != "—":
                # Draw label background
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1.0, 2)
                cv2.rectangle(output_img, (x, y - th - 15), (x + tw + 10, y), color, -1)
                cv2.putText(output_img, label, (x + 5, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)

            output_path = os.path.join(OUTPUT_DIR, f"result_{img_name}")
            cv2.imwrite(output_path, output_img)

    # ── Summary Table ──
    print("\n" + "=" * 75)
    print("  RESULTS COMPARISON TABLE")
    print("=" * 75)
    print(f"  {'Image':<10} {'Conf':<8} {'Tesseract':<16} {'EasyOCR':<16} {'PaddleOCR':<16}")
    print("  " + "─" * 66)
    for r in results_summary:
        conf = r.get('conf', '—')
        print(f"  {r['image']:<10} {conf:<8} {r['tesseract']:<16} {r['easyocr']:<16} {r['paddleocr']:<16}")

    print("=" * 75)
    print(f"\n  Detection model: {model_name}")
    print(f"  Output images:   {OUTPUT_DIR}")
    print("  Done!\n")


if __name__ == "__main__":
    main()
