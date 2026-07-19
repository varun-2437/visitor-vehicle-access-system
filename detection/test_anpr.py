"""
ANPR Test Script — YOLOv8 + OCR Comparison
Tests license plate detection on sample images using:
  - YOLOv8 (ultralytics) for plate detection
  - pytesseract vs easyocr for plate text recognition
"""

import os
import sys
import time
import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO
from PIL import Image

# ─── CONFIG ────────────────────────────────────────────────────
INPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "temp", "Indian-Number-Plate-Recognition-master", "inputs")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "test_images", "results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Only process image files (skip videos)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ─── PLATE PATTERN VALIDATOR ──────────────────────────────────
def is_indian_plate(text):
    """Check if text loosely matches Indian plate format (e.g., MH12AB1234)"""
    clean = text.replace(" ", "").replace("-", "").upper()
    if len(clean) < 8 or len(clean) > 12:
        return False
    return True  # loose check for testing; tighten later


# ─── OCR METHODS ──────────────────────────────────────────────
def ocr_tesseract(plate_img):
    """Run Tesseract OCR on a plate crop"""
    import pytesseract
    gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
    # Preprocessing: resize, threshold for better OCR
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    config = '--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    text = pytesseract.image_to_string(thresh, config=config).strip()
    return text


def ocr_easyocr(plate_img, reader):
    """Run EasyOCR on a plate crop"""
    results = reader.readtext(plate_img, detail=0, paragraph=True)
    text = " ".join(results).strip().upper()
    return text


# ─── MAIN ─────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  ANPR Test — YOLOv8 + OCR Comparison")
    print("=" * 60)

    # ── Load YOLOv8 model (pretrained on license plates) ──
    # Using a pretrained YOLO model; first run may download weights
    print("\n[1/3] Loading YOLOv8 model...")
    model = YOLO("yolov8n.pt")  # nano model for speed; upgrade to yolov8s/m for accuracy
    print("  ✓ YOLOv8n loaded")

    # ── Try loading EasyOCR (optional) ──
    easyocr_reader = None
    try:
        import easyocr
        print("\n[2/3] Loading EasyOCR reader...")
        easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        print("  ✓ EasyOCR loaded")
    except ImportError:
        print("\n[2/3] EasyOCR not installed — skipping (install with: pip install easyocr)")

    # ── Check for Tesseract ──
    tesseract_available = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_available = True
        print("  ✓ Tesseract available")
    except Exception:
        print("  ⚠ Tesseract not found — skipping (install with: brew install tesseract)")

    # ── Get input images ──
    print(f"\n[3/3] Scanning for images in: {INPUT_DIR}")
    images = sorted([
        f for f in os.listdir(INPUT_DIR)
        if Path(f).suffix.lower() in IMAGE_EXTENSIONS
    ])

    if not images:
        print("  ✗ No images found! Add .jpg/.png files to the inputs folder.")
        sys.exit(1)

    print(f"  Found {len(images)} images: {images}\n")
    print("─" * 60)

    # ── Process each image ──
    results_summary = []

    for img_name in images:
        img_path = os.path.join(INPUT_DIR, img_name)
        print(f"\n📷 Processing: {img_name}")
        print("-" * 40)

        img = cv2.imread(img_path)
        if img is None:
            print("  ✗ Failed to read image, skipping.")
            continue

        # ── YOLOv8 Detection ──
        t_start = time.time()
        yolo_results = model(img, verbose=False)
        t_detect = time.time() - t_start

        # Look for detections (class 0 = general object in pretrained model)
        # For license plate specific detection, we'd need a plate-trained model
        detections = yolo_results[0].boxes
        print(f"  YOLOv8 detection time: {t_detect:.3f}s")
        print(f"  Objects detected: {len(detections)}")

        # Since we're using generic YOLO (not plate-specific), let's also
        # try a simple OpenCV-based plate detection as fallback
        plate_crops = []

        # Method: Use contour-based plate detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.bilateralFilter(gray, 11, 17, 17)
        edges = cv2.Canny(gray, 30, 200)

        contours, _ = cv2.findContours(edges.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

        plate_contour = None
        for contour in contours:
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.018 * peri, True)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                aspect_ratio = w / float(h)
                # Indian plates are roughly 2:1 to 5:1 aspect ratio
                if 1.5 <= aspect_ratio <= 6.0 and w > 60 and h > 15:
                    plate_contour = approx
                    plate_crop = img[y:y+h, x:x+w]
                    plate_crops.append((plate_crop, x, y, w, h))
                    break

        if not plate_crops:
            print("  ⚠ No plate region detected via contour method")
            # Fallback: use center crop as a rough plate region
            h_img, w_img = img.shape[:2]
            cx, cy = w_img // 2, int(h_img * 0.6)
            crop_w, crop_h = w_img // 3, h_img // 8
            x1 = max(0, cx - crop_w // 2)
            y1 = max(0, cy - crop_h // 2)
            plate_crop = img[y1:y1+crop_h, x1:x1+crop_w]
            plate_crops.append((plate_crop, x1, y1, crop_w, crop_h))
            print("  ℹ Using center-region fallback crop")

        # ── OCR on detected plate crops ──
        for idx, (crop, x, y, w, h) in enumerate(plate_crops):
            result_entry = {"image": img_name, "tesseract": "N/A", "easyocr": "N/A"}

            # Tesseract
            if tesseract_available:
                t_start = time.time()
                tess_text = ocr_tesseract(crop)
                t_tess = time.time() - t_start
                result_entry["tesseract"] = tess_text
                print(f"  Tesseract OCR: \"{tess_text}\" ({t_tess:.3f}s)")

            # EasyOCR
            if easyocr_reader:
                t_start = time.time()
                easy_text = ocr_easyocr(crop, easyocr_reader)
                t_easy = time.time() - t_start
                result_entry["easyocr"] = easy_text
                print(f"  EasyOCR:       \"{easy_text}\" ({t_easy:.3f}s)")

            results_summary.append(result_entry)

            # ── Draw bounding box and save result ──
            output_img = img.copy()
            cv2.rectangle(output_img, (x, y), (x + w, y + h), (0, 255, 0), 2)
            label = result_entry.get("tesseract", "") or result_entry.get("easyocr", "")
            if label:
                cv2.putText(output_img, label, (x, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

            output_path = os.path.join(OUTPUT_DIR, f"result_{img_name}")
            cv2.imwrite(output_path, output_img)
            print(f"  💾 Saved: {output_path}")

    # ── Summary Table ──
    print("\n" + "=" * 60)
    print("  RESULTS SUMMARY")
    print("=" * 60)
    print(f"  {'Image':<12} {'Tesseract':<20} {'EasyOCR':<20}")
    print("  " + "-" * 52)
    for r in results_summary:
        print(f"  {r['image']:<12} {r['tesseract']:<20} {r['easyocr']:<20}")
    print("=" * 60)
    print(f"\n  Output images saved to: {OUTPUT_DIR}")
    print("  Done!\n")


if __name__ == "__main__":
    main()
