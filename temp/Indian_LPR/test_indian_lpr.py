import os
import sys
import cv2
import torch
import json
from pathlib import Path

# Add current directory to python path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.object_detection.model.fcos import FCOSDetector
from src.object_detection.model.config import DefaultConfig
from src.object_detection.utils.utils import preprocess_image as od_preprocess

from src.semantic_segmentation.models.hrnet import hrnet
from src.semantic_segmentation.utils.util import (
    get_warped_plates,
    plate_locate,
    get_score_and_class_from_prediction,
    preprocess_image as ss_preprocess,
    upsample_coordinates,
    convert_coordinates_to_bbox,
)

from src.License_Plate_Recognition.model.LPRNet import build_lprnet
from src.License_Plate_Recognition.test_LPRNet import Greedy_Decode_inference
import numpy as np

# Config paths
INPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Indian-Number-Plate-Recognition-master", "inputs")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def run_od_inference(od_model, lprnet, image):
    original_image = image.copy()
    img_tensor = od_preprocess(image)
    if torch.cuda.is_available():
        img_tensor = img_tensor.cuda()
    with torch.no_grad():
        out = od_model(img_tensor)
        scores, classes, boxes = out
        boxes = [
            [int(i[0]), int(i[1]), int(i[2]), int(i[3])]
            for i in boxes[0].cpu().numpy().tolist()
        ]
    if len(boxes) == 0:
        return []
    
    plate_images = []
    for b in boxes:
        # Clamp boxes to image boundary
        h, w = original_image.shape[:2]
        x1 = max(0, min(b[0], w - 1))
        y1 = max(0, min(b[1], h - 1))
        x2 = max(0, min(b[2], w - 1))
        y2 = max(0, min(b[3], h - 1))
        if x2 <= x1 or y2 <= y1:
            continue
        plate_image = original_image[y1:y2, x1:x2, :]
        if plate_image.size == 0:
            continue
        im = cv2.resize(plate_image, (94, 24)).astype("float32")
        im -= 127.5
        im *= 0.0078125
        im = torch.from_numpy(np.transpose(im, (2, 0, 1)))
        plate_images.append(im)

    if len(plate_images) == 0:
        return []
    plate_labels = Greedy_Decode_inference(lprnet, torch.stack(plate_images, 0))
    return list(zip(boxes, plate_labels))

def run_ss_inference(semantic_model, lprnet, image, conf_thresh=0.5):
    original_image = image.copy()
    img_tensor = ss_preprocess(image)
    if torch.cuda.is_available():
        img_tensor = img_tensor.cuda()
    with torch.no_grad():
        out = semantic_model(img_tensor, (img_tensor.shape[2], img_tensor.shape[3]))
        prediction_softmax = torch.nn.Softmax(dim=1)(out["output"])
        out_argmax = (
            torch.argmax(out["output"], dim=1)
            .detach()
            .cpu()
            .squeeze(dim=0)
            .numpy()
            .astype(np.uint8)
        )
        coordinates, _ = plate_locate(out_argmax)
        scores = get_score_and_class_from_prediction(out_argmax, prediction_softmax, coordinates)
        pred_boxes = convert_coordinates_to_bbox(coordinates)

        pred_boxes_new = []
        coordinates_new = []
        for box, score, c in zip(pred_boxes, scores, coordinates):
            if score[0] > conf_thresh:
                pred_boxes_new.append(box)
                coordinates_new.append(c)

        coordinates, boxes = upsample_coordinates(
            coordinates_new, out_argmax.shape, original_image.shape
        )

    if len(boxes) == 0:
        return []

    plate_images = get_warped_plates(original_image, coordinates)
    plate_images_tensor = []
    valid_boxes = []
    for plate_image, box in zip(plate_images, boxes):
        if plate_image.size == 0:
            continue
        im = cv2.resize(plate_image, (94, 24)).astype("float32")
        im -= 127.5
        im *= 0.0078125
        im = torch.from_numpy(np.transpose(im, (2, 0, 1)))
        plate_images_tensor.append(im)
        valid_boxes.append(box)

    if len(plate_images_tensor) == 0:
        return []
    plate_labels = Greedy_Decode_inference(lprnet, torch.stack(plate_images_tensor, 0))
    return list(zip(valid_boxes, plate_labels))

def main():
    print("=" * 70)
    print("  ANPR Test with Indian_LPR Repo Models")
    print("=" * 70)

    # Load Object Detection model
    print("\n[1/3] Loading Object Detection (FCOS)...")
    od_model = FCOSDetector(mode="inference", config=DefaultConfig).eval()
    od_model.load_state_dict(
        torch.load("weights/best_od.pth", map_location=torch.device("cpu"))
    )

    # Load Semantic Segmentation model
    print("[2/3] Loading Semantic Segmentation (HRNet)...")
    semantic_model = hrnet().eval()
    # Handle DataParallel state dict if loaded on CPU
    state_dict = torch.load("weights/best_semantic.pth", map_location=torch.device("cpu"))["state_dict"]
    # Remove 'module.' prefix if state dict has it and model is not DataParallel
    new_state_dict = {}
    for k, v in state_dict.items():
        name = k[7:] if k.startswith('module.') else k
        new_state_dict[name] = v
    semantic_model.load_state_dict(new_state_dict)

    # Load OCR model (LPRNet)
    print("[3/3] Loading OCR (LPRNet)...")
    lprnet = build_lprnet(lpr_max_len=16, class_num=37).eval()
    lprnet.load_state_dict(
        torch.load("weights/best_lprnet.pth", map_location=torch.device("cpu"))
    )

    if torch.cuda.is_available():
        od_model = od_model.cuda()
        semantic_model = semantic_model.cuda()
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

        print(f"\n📷 Image: {img_name}")
        print("-" * 50)

        # 1. Object Detection + OCR
        od_res = run_od_inference(od_model, lprnet, img)
        od_labels = [label for _, label in od_res]
        print(f"  📦 Object Det + LPRNet:  {od_labels}")

        # 2. Semantic Seg + OCR
        ss_res = run_ss_inference(semantic_model, lprnet, img)
        ss_labels = [label for _, label in ss_res]
        print(f"  🎨 Semantic Seg + LPRNet: {ss_labels}")

        # Draw results on image
        out_img = img.copy()
        for box, label in od_res:
            c1, c2 = (int(box[0]), int(box[1])), (int(box[2]), int(box[3]))
            cv2.rectangle(out_img, c1, c2, (255, 0, 0), 2)
            cv2.putText(out_img, f"OD: {label}", (c1[0], c1[1] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

        for box, label in ss_res:
            c1, c2 = (int(box[0]), int(box[1])), (int(box[2]), int(box[3]))
            cv2.rectangle(out_img, c1, c2, (0, 255, 0), 2)
            cv2.putText(out_img, f"SS: {label}", (c1[0], c2[1] + 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imwrite(os.path.join(OUTPUT_DIR, f"result_{img_name}"), out_img)

        results.append({
            "image": img_name,
            "od_lpr": ", ".join(od_labels) if od_labels else "—",
            "ss_lpr": ", ".join(ss_labels) if ss_labels else "—"
        })

    # Summary table
    print("\n" + "=" * 70)
    print("  SUMMARY TABLE")
    print("=" * 70)
    print(f"  {'Image':<10} {'Object Det + LPRNet':<25} {'Semantic Seg + LPRNet':<25}")
    print("  " + "─" * 62)
    for r in results:
        print(f"  {r['image']:<10} {r['od_lpr']:<25} {r['ss_lpr']:<25}")
    print("=" * 70)
    print(f"\nAnnotated outputs saved to: {OUTPUT_DIR}\n")

if __name__ == "__main__":
    main()
