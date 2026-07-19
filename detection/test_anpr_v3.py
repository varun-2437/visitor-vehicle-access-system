"""
ANPR Test v3 — PaddleOCR End-to-End vs EasyOCR vs Tesseract
Uses PaddleOCR's built-in text detector (DB++) to find plate text directly.
No plate-specific YOLO model needed.
"""

import os
import sys
import re
import time
import cv2
import numpy as np
from pathlib import Path

# ─── CONFIG ────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
INPUT_DIR = os.path.join(PROJECT_DIR, "temp", "Indian-Number-Plate-Recognition-master", "inputs")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "data", "test_images", "results_v3")
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Indian plate regex: 2 letters + 1-2 digits + 1-2 letters + 4 digits
# Examples: MH12JC2813, TS08FM8888, MH14DX5842, DL3CAY1234
PLATE_PATTERN = re.compile(
    r'[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}',
    re.IGNORECASE
)


def looks_like_plate(text):
    """Check if text matches Indian license plate pattern"""
    clean = re.sub(r'[\s\-\.]', '', text).upper()
    return bool(PLATE_PATTERN.search(clean)) or (
        len(clean) >= 8 and len(clean) <= 12
        and any(c.isdigit() for c in clean)
        and any(c.isalpha() for c in clean)
    )


def extract_plate_number(text):
    """Extract just the plate number from noisy OCR text"""
    clean = re.sub(r'[\s\-\.]', '', text).upper()
    match = PLATE_PATTERN.search(clean)
    if match:
        return match.group(0)
    return clean


# ─── CONTOUR-BASED PLATE DETECTOR ────────────────────────────
def detect_plate_contour(img):
    """Find plate region using edge detection + contour filtering"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    edges = cv2.Canny(gray, 30, 200)

    contours, _ = cv2.findContours(edges.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

    plates = []
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.018 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            aspect_ratio = w / float(h)
            if 1.5 <= aspect_ratio <= 6.0 and w > 60 and h > 15:
                plates.append((x, y, w, h))
    return plates


# ─── MAIN ─────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("  ANPR Test v3 — PaddleOCR (E2E) vs EasyOCR vs Tesseract (Contour)")
    print("=" * 70)

    # ── Load PaddleOCR ──
    print("\n[1/3] Loading PaddleOCR (end-to-end)...")
    paddle_engine = None
    try:
        from paddleocr import PaddleOCR
        paddle_engine = PaddleOCR(lang='en')
        print("  ✓ PaddleOCR loaded (DB++ detector + SVTR recognizer)")
    except ImportError:
        print("  ✗ Not installed — run: pip install paddlepaddle paddleocr")
    except Exception as e:
        print(f"  ✗ Error: {e}")

    # ── Load EasyOCR ──
    print("\n[2/3] Loading EasyOCR...")
    easyocr_reader = None
    try:
        import easyocr
        easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        print("  ✓ EasyOCR loaded")
    except ImportError:
        print("  ⚠ Not installed")

    # ── Check Tesseract ──
    tesseract_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_ok = True
        print("  ✓ Tesseract available")
    except Exception:
        print("  ⚠ Tesseract not found")

    # ── Get images ──
    print(f"\n[3/3] Scanning: {INPUT_DIR}")
    images = sorted([
        f for f in os.listdir(INPUT_DIR)
        if Path(f).suffix.lower() in IMAGE_EXTENSIONS
    ])
    print(f"  Found {len(images)} images: {images}\n")
    print("─" * 70)

    results = []

    for img_name in images:
        img_path = os.path.join(INPUT_DIR, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue

        print(f"\n📷 {img_name} ({img.shape[1]}x{img.shape[0]})")
        print("-" * 50)

        entry = {"image": img_name, "paddle_e2e": "—", "easyocr_contour": "—", "tess_contour": "—"}
        output_img = img.copy()

        # ═══════════════════════════════════════════════════
        # METHOD 1: PaddleOCR End-to-End (full image scan)
        # ═══════════════════════════════════════════════════
        if paddle_engine:
            t = time.time()
            paddle_result = paddle_engine.ocr(img, cls=True)
            t_paddle = time.time() - t

            plate_texts = []
            all_texts = []
            if paddle_result and paddle_result[0]:
                for line in paddle_result[0]:
                    bbox_pts = line[0]  # 4 corner points
                    text = line[1][0]
                    conf = line[1][1]
                    all_texts.append(f"  [{conf:.0%}] {text}")

                    # Check if this text looks like a plate number
                    if looks_like_plate(text):
                        plate_num = extract_plate_number(text)
                        plate_texts.append((plate_num, conf, bbox_pts))

                        # Draw on output image
                        pts = np.array(bbox_pts, dtype=np.int32)
                        cv2.polylines(output_img, [pts], True, (0, 255, 0), 3)
                        cv2.putText(output_img, plate_num,
                                    (int(bbox_pts[0][0]), int(bbox_pts[0][1]) - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)

            print(f"  🔵 PaddleOCR E2E ({t_paddle:.2f}s) — all text found:")
            for t in all_texts:
                print(f"    {t}")

            if plate_texts:
                best_plate = max(plate_texts, key=lambda x: x[1])
                entry["paddle_e2e"] = best_plate[0]
                print(f"  ➜ Plate detected: {best_plate[0]} (conf: {best_plate[1]:.0%})")
            else:
                # If no plate pattern matched, show the best text found
                if all_texts:
                    entry["paddle_e2e"] = "(no plate pattern)"
                print(f"  ➜ No Indian plate pattern found in detected text")

        # ═══════════════════════════════════════════════════
        # METHOD 2 & 3: Contour Detection + EasyOCR/Tesseract
        # ═══════════════════════════════════════════════════
        plates_found = detect_plate_contour(img)

        if plates_found:
            x, y, w, h = plates_found[0]  # Use first plate found
            crop = img[y:y+h, x:x+w]
            print(f"  📐 Contour plate found at ({x},{y},{w},{h})")

            # Draw contour detection in yellow
            cv2.rectangle(output_img, (x, y), (x + w, y + h), (0, 255, 255), 2)

            # Tesseract on crop
            if tesseract_ok:
                import pytesseract
                gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                gray_crop = cv2.resize(gray_crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
                _, thresh = cv2.threshold(gray_crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                config = '--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                t = time.time()
                tess_text = pytesseract.image_to_string(thresh, config=config).strip()
                entry["tess_contour"] = tess_text if tess_text else "(empty)"
                print(f"  🟡 Tesseract+Contour: \"{tess_text}\" ({time.time()-t:.3f}s)")

            # EasyOCR on crop
            if easyocr_reader:
                t = time.time()
                easy_results = easyocr_reader.readtext(crop, detail=0, paragraph=True)
                easy_text = " ".join(easy_results).strip().upper()
                entry["easyocr_contour"] = easy_text if easy_text else "(empty)"
                print(f"  🟠 EasyOCR+Contour:   \"{easy_text}\" ({time.time()-t:.3f}s)")
        else:
            print(f"  📐 No plate found via contour method")
            entry["tess_contour"] = "(no contour)"
            entry["easyocr_contour"] = "(no contour)"

        # Save annotated image
        out_path = os.path.join(OUTPUT_DIR, f"result_{img_name}")
        cv2.imwrite(out_path, output_img)
        print(f"  💾 Saved: {out_path}")

        results.append(entry)

    # ── Final Comparison ──
    print("\n" + "=" * 80)
    print("  FINAL COMPARISON")
    print("=" * 80)
    print(f"  {'Image':<10} {'PaddleOCR (E2E)':<22} {'EasyOCR+Contour':<22} {'Tesseract+Contour':<22}")
    print("  " + "─" * 70)
    for r in results:
        print(f"  {r['image']:<10} {r['paddle_e2e']:<22} {r['easyocr_contour']:<22} {r['tess_contour']:<22}")

    print("=" * 80)
    print("\n  🟢 = PaddleOCR end-to-end (scans full image, no plate detector needed)")
    print("  🟡 = Tesseract on contour-detected plate crop")
    print("  🟠 = EasyOCR on contour-detected plate crop")
    print(f"\n  Results saved to: {OUTPUT_DIR}\n")


if __name__ == "__main__":
    main()
