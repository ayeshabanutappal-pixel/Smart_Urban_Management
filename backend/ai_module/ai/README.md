# AI Waste Detection Module (`ai/`)

**Project:** Smart Urban Waste Detection and Management System  
**Event:** PRASUNEX INNOVATHON 2026 – Round 3 MVP  
**Module Owner:** Member 3 (AI Developer)  

---

## 1. Overview & Architecture

The `ai/` module is a standalone, modular computer vision sub-system designed for automated waste and object identification from citizen-submitted complaint images. It is built using **Ultralytics YOLOv8** and **OpenCV (`cv2`)** with zero hard dependencies on Flask or MySQL, allowing it to be imported and tested independently.

```
Citizen Photo ---> Flask Backend ---> detect_waste(image_path) ---> YOLO Inference
                                                                          │
                                                                          ▼
                                                                 OpenCV Annotation
                                                                          │
                                                                          ▼
MySQL & Admin Dashboard <--- Structured Dictionary Result <─── Save Annotated Image
```

---

## 2. Interface Specification (For Backend Developer)

To integrate this module into the Flask application:

```python
from ai.detector import detect_waste

# Call detection on any saved image
result = detect_waste("uploads/citizen_complaint_101.jpg")
```

### Return Dictionary Format:

#### On Success (Objects Detected):
```json
{
  "success": true,
  "detections": [
    {
      "class_name": "bottle",
      "confidence": 0.60,
      "bbox": [96, 192, 115, 232]
    },
    {
      "class_name": "cup",
      "confidence": 0.76,
      "bbox": [89, 182, 265, 420]
    }
  ],
  "total_detections": 2,
  "annotated_image": "ai/outputs/annotated_citizen_complaint_101.jpg",
  "error": null
}
```

#### On Success (Clean Scene / No Objects Detected):
```json
{
  "success": true,
  "detections": [],
  "total_detections": 0,
  "annotated_image": "ai/outputs/annotated_clean_scene.jpg",
  "error": null
}
```

#### On Error (Missing or Corrupted Image):
```json
{
  "success": false,
  "detections": [],
  "total_detections": 0,
  "annotated_image": null,
  "error": "Could not read image file. It may be corrupt or in an unsupported format: 'invalid.txt'"
}
```

---

## 3. Directory Layout

```
ai/
|-- __init__.py           # Package init exposing `detect_waste`
|-- detector.py           # Core detection engine and OpenCV annotator
|-- test_detector.py      # Automated 5-case test suite
|-- README.md             # Technical module documentation
|-- samples/              # Real test images
|   |-- 1_bottle.jpg
|   |-- 2_garbage_litter.jpg
|   |-- 3_multiple_objects.jpg
|   |-- 4_clean_scene.jpg
|   |-- 5_invalid_file.txt
`-- outputs/              # Annotated images with bounding boxes & labels
    |-- annotated_1_bottle.jpg
    |-- annotated_2_garbage_litter.jpg
    |-- annotated_3_multiple_objects.jpg
    `-- annotated_4_clean_scene.jpg
```

---

## 4. How to Run the Tests

Activate your virtual environment and run the test suite:

```powershell
# Windows PowerShell
.\.venv\Scripts\python.exe ai/test_detector.py
```

### Verification Results:
- **Test 1 (Bottle):** Successfully detected `bottle` (60% confidence).
- **Test 2 (Litter Pile):** Successfully detected 14 objects including disposable cups (76%, 71%, 60%) and takeout bowls (78%, 69%, 64%).
- **Test 3 (Multiple Objects):** Successfully identified bus (87%), pedestrians (87%, 85%, 82%), and stop sign (35%).
- **Test 4 (Clean Scene):** Returns `total_detections: 0` without false alarms.
- **Test 5 (Invalid File):** Caught safely without crashing the backend process.

---

## 5. Model Capabilities & Technical Limitations

1. **Current Model:** `yolov8n.pt` (YOLOv8 Nano, pre-trained on MS COCO 80 classes).
2. **Recognizable Waste Classes:** Plastic bottles, beverage cans, disposable cups, takeout containers (bowls), food scraps (fruits/oranges/apples), handbags, and discarded furniture.
3. **Known Limitation:** A general pre-trained model does not identify unshaped loose municipal garbage (e.g., wet sludge, decomposed matter, torn wrappers) because those are not distinct COCO categories.
4. **Planned Hackathon Improvement:** Fine-tune YOLO on the **TACO (Trash Annotations in Context)** open-source dataset with 60 specialized urban waste categories (plastic films, bio-waste, cigarette butts, e-waste).
