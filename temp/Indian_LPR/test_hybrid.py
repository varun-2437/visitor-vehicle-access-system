import os
import sys
import cv2
import torch
from pathlib import Path

# Add current directory to python path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.object_detection.model.fcos import FCOSDetector
from src.object_detection.model.config import DefaultConfig
from src.object_detection.utils.utils import preprocess_image as od_preprocess
from src.License_Plate_Recognition.model.LPRNet import build_lprnet
from src.License_Plate_Recognition.test_LPRNet import Greedy_Decode_inference
import numpy as np

# Load OCR engines
import pytesseract
import easyocr
easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)

# Config paths
INPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Indian-Number-Plate-Recognition-master", "inputs")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hybrid_results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def run_tesseract(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    config = '--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return pytesseract.image_to_string(thresh, config=config).strip()

def run_easyocr(crop):
    results = easyocr_reader.readtext(crop, detail=0, paragraph=True)
    return " ".join(results).replace(" ", "").replace("-", "").strip().upper()

def main():
    print("=" * 80)
    print("  ANPR Hybrid Test — FCOS Detector + Multi-OCR Compare")
    print("=" * 80)

    # Load Object Detection model (FCOS)
    print("\n[1/2] Loading FCOS Plate Detector...")
    od_model = FCOSDetector(mode="inference", config=DefaultConfig).eval()
    od_model.load_state_dict(
        torch.load("weights/best_od.pth", map_location=torch.device("cpu"))
    )

    # Load LPRNet
    print("[2/2] Loading LPRNet...")
    lprnet = build_lprnet(lpr_max_len=16, class_num=37).eval()
    lprnet.load_state_dict(
        torch.load("weights/best_lprnet.pth", map_location=torch.device("cpu"))
    )

    if torch.cuda.is_available():
        od_model = od_model.cuda()
        lprnet = lprnet.cuda()

    images = sorted([
        f for f in os.listdir(INPUT_DIR)
        if Path(f).suffix.lower() in {".jpg", ".jpeg", ".png"}
    ])

    results = []

    for img_name in images:
        img_path = os.path.join(INPUT_DIR, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue

        print(f"\n📷 Processing: {img_name}")
        print("-" * 60)

        # Preprocess for detector
        img_tensor = od_preprocess(img)
        if torch.cuda.is_available():
            img_tensor = img_tensor.cuda()

        with torch.no_grad():
            out = od_model(img_tensor)
            scores, classes, boxes = out
            boxes = [
                [int(i[0]), int(i[1]), int(i[2]), int(i[3])]
                for i in boxes[0].cpu().numpy().tolist()
            ]

        if not boxes:
            print("  ❌ No plate region detected!")
            results.append({
                "image": img_name,
                "lprnet": "—",
                "tesseract": "—",
                "easyocr": "—"
            })
            continue

        # Use the highest confidence box (first one)
        b = boxes[0]
        h_orig, w_orig = img.shape[:2]
        x1 = max(0, min(b[0], w_orig - 1))
        y1 = max(0, min(b[1], h_orig - 1))
        x2 = max(0, min(b[2], w_orig - 1))
        y2 = max(0, min(b[3], h_orig - 1))
        
        plate_crop = img[y1:y2, x1:x2]

        # 1. OCR with LPRNet
        im_lpr = cv2.resize(plate_crop, (94, 24)).astype("float32")
        im_lpr -= 127.5
        im_lpr *= 0.0078125
        im_lpr = torch.from_numpy(np.transpose(im_lpr, (2, 0, 1))).unsqueeze(0)
        if torch.cuda.is_available():
            im_lpr = im_lpr.cuda()
        lprnet_label = Greedy_Decode_inference(lprnet, im_lpr)[0]

        # 2. OCR with Tesseract
        tess_label = run_tesseract(plate_crop)

        # 3. OCR with EasyOCR
        easy_label = run_easyocr(plate_crop)

        print(f"  ➜ LPRNet:    {lprnet_label}")
        print(f"  ➜ Tesseract: {tess_label}")
        print(f"  ➜ EasyOCR:   {easy_label}")

        # Draw box and labels on image
        out_img = img.copy()
        cv2.rectangle(out_img, (x1, y1), (x2, y2), (0, 255, 0), 3)
        cv2.putText(out_img, f"EasyOCR: {easy_label}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imwrite(os.path.join(OUTPUT_DIR, f"result_{img_name}"), out_img)

        results.append({
            "image": img_name,
            "lprnet": lprnet_label or "—",
            "tesseract": tess_label or "—",
            "easyocr": easy_label or "—"
        })

    # Summary table
    print("\n" + "=" * 80)
    print("  SUMMARY BENCHMARK TABLE")
    print("=" * 80)
    print(f"  {'Image':<10} {'LPRNet (Default)':<18} {'Tesseract (Hybrid)':<20} {'EasyOCR (Hybrid)':<20}")
    print("  " + "─" * 72)
    for r in results:
        print(f"  {r['image']:<10} {r['lprnet']:<18} {r['tesseract']:<20} {r['easyocr']:<20}")
    print("=" * 80)
    print(f"\nAnnotated outputs saved to: {OUTPUT_DIR}\n")

if __name__ == "__main__":
    main()
