# License Plate Test Images Directory

Place vehicle / license plate photos here to benchmark and test detection (FCOS / YOLO) and OCR models (LPRNet, Tesseract, EasyOCR).

### Supported Formats
- `.jpg`, `.jpeg`, `.png`, `.webp`

### How to Run Tests
From the project root:
```bash
# Activate virtual environment
source venv/bin/activate

# Run full benchmark on all images in this folder
python scripts/test_all_models.py
```
