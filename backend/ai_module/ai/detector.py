"""
Smart Urban Waste Detection and Management System
Module: AI Waste Detector (ai/detector.py)
Developer: Member 3 (AI Developer)

This module provides the independent function `detect_waste(image_path)`
which loads a YOLO object-detection model, detects recognizable objects,
draws bounding boxes and labels using OpenCV, saves the annotated image,
and returns a structured dictionary for the Flask backend.
"""

import os
from pathlib import Path
import cv2
from ultralytics import YOLO

# Global model cache to avoid reloading weights into memory on every function call
_MODEL = None
DEFAULT_MODEL_NAME = "yolov8n.pt"  # Lightweight YOLOv8 Nano model (runs fast on CPU)


def get_model(model_name: str = DEFAULT_MODEL_NAME) -> YOLO:
    """
    Loads and caches the YOLO model.
    Downloads the weights automatically on first run.
    """
    global _MODEL
    if _MODEL is None:
        print(f"[AI Module] Loading YOLO model: {model_name}...")
        _MODEL = YOLO(model_name)
        print("[AI Module] Model loaded successfully.")
    return _MODEL


def detect_waste(
    image_path: str,
    output_dir: str = "ai/outputs",
    conf_threshold: float = 0.25
) -> dict:
    """
    Detects objects in an image and returns a structured dictionary.

    Args:
        image_path (str): Path to the input image file.
        output_dir (str): Directory where the annotated image will be saved.
        conf_threshold (float): Minimum confidence threshold (0.0 to 1.0) to filter detections.

    Returns:
        dict: Structured result containing:
            - success (bool): True if processed successfully, False otherwise.
            - detections (list): List of detected objects with class_name, confidence, and bbox.
            - total_detections (int): Number of detected objects.
            - annotated_image (str | None): Path to the saved annotated image.
            - error (str | None): Error message if success is False.
    """
    # 1. Validate that the image file exists
    if not image_path or not os.path.exists(image_path):
        return {
            "success": False,
            "error": f"Image file not found: '{image_path}'",
            "detections": [],
            "total_detections": 0,
            "annotated_image": None
        }

    # 2. Validate that the image can be read by OpenCV
    image = cv2.imread(image_path)
    if image is None:
        return {
            "success": False,
            "error": f"Could not read image file. It may be corrupt or in an unsupported format: '{image_path}'",
            "detections": [],
            "total_detections": 0,
            "annotated_image": None
        }

    try:
        # 3. Load the YOLO model
        model = get_model()

        # 4. Perform object detection (inference)
        # verbose=False keeps the console output clean
        results = model.predict(source=image, conf=conf_threshold, verbose=False)

        # 5. Prepare output directory
        os.makedirs(output_dir, exist_ok=True)
        input_filename = Path(image_path).name
        output_filename = f"annotated_{input_filename}"
        output_path = os.path.join(output_dir, output_filename)

        detections = []
        annotated_image = image.copy()

        # 6. Extract detections from model results
        if results and len(results) > 0:
            result = results[0]  # First (and only) image prediction

            for box in result.boxes:
                # Extract coordinates: [x1, y1, x2, y2]
                coords = box.xyxy[0].tolist()
                x1, y1, x2, y2 = [int(v) for v in coords]

                # Extract confidence score and class name
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names.get(class_id, f"class_{class_id}")

                detections.append({
                    "class_name": class_name,
                    "confidence": round(confidence, 2),
                    "bbox": [x1, y1, x2, y2]
                })

                # 7. Use OpenCV to draw bounding box and label
                # Box color: Bright green (BGR format: 0, 255, 0)
                box_color = (0, 255, 0)
                cv2.rectangle(annotated_image, (x1, y1), (x2, y2), box_color, 2)

                # Label text: e.g. "bottle 92%"
                label = f"{class_name} {int(confidence * 100)}%"
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.6
                thickness = 2

                # Calculate text size for the background banner
                (text_width, text_height), baseline = cv2.getTextSize(
                    label, font, font_scale, thickness
                )

                # Draw filled background rectangle for readable text
                label_y1 = max(y1 - text_height - 10, 0)
                label_y2 = max(y1, text_height + 10)
                cv2.rectangle(
                    annotated_image,
                    (x1, label_y1),
                    (x1 + text_width + 8, label_y2),
                    box_color,
                    -1  # Filled rectangle
                )

                # Draw label text in black over the green banner
                cv2.putText(
                    annotated_image,
                    label,
                    (x1 + 4, label_y2 - 5),
                    font,
                    font_scale,
                    (0, 0, 0),  # Black text for high contrast
                    thickness,
                    cv2.LINE_AA
                )

        # 8. Save the annotated image to disk
        clean_output_path = output_path.replace("\\", "/")
        cv2.imwrite(clean_output_path, annotated_image)

        # 9. Return structured dictionary
        return {
            "success": True,
            "detections": detections,
            "total_detections": len(detections),
            "annotated_image": clean_output_path,
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Model inference error: {str(e)}",
            "detections": [],
            "total_detections": 0,
            "annotated_image": None
        }
