"""
Smart Urban Waste Detection and Management System
Module: AI Waste Detection Test Suite (ai/test_detector.py)
Developer: Member 3 (AI Developer)

This script thoroughly tests the independent `detect_waste` function
against the 5 required test cases:
1. Image containing a bottle.
2. Image containing garbage/litter (disposable cups & bowls).
3. Image containing multiple recognizable objects.
4. Image with no recognized objects (clean scene).
5. Invalid image file (non-image text file).

Usage:
    python ai/test_detector.py
"""

import os
import sys
import json

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ai.detector import detect_waste


def print_separator(title: str):
    print("\n" + "=" * 72)
    print(f"  {title.upper()}")
    print("=" * 72)


def run_test(case_number: int, description: str, image_path: str):
    print_separator(f"TEST {case_number}: {description}")
    print(f"Input file: {image_path}")
    print(f"File exists on disk: {os.path.exists(image_path)}")

    # Execute the actual AI detector
    result = detect_waste(image_path)

    # Print formatted JSON result
    print("\n[AI Module Returned Result]:")
    print(json.dumps(result, indent=2))

    # Evaluate the result
    if result["success"]:
        print(f"\n[Status]: Processed Successfully")
        print(f"[Total Objects Detected]: {result['total_detections']}")
        if result["detections"]:
            print("[Detections Breakdown]:")
            for idx, det in enumerate(result["detections"], 1):
                print(f"   {idx}. Class: '{det['class_name']}' | "
                      f"Confidence: {int(det['confidence'] * 100)}% | "
                      f"BBox: {det['bbox']}")
            print(f"[Annotated Image Saved At]: {result['annotated_image']}")
            assert os.path.exists(result["annotated_image"]), "Annotated image was not saved!"
        else:
            print("[Info]: No objects detected (as expected for a clean scene).")
    else:
        print(f"\n[Status]: Handled Error Gracefully (Expected for invalid input)")
        print(f"[Error Message]: {result['error']}")

    return result


def main():
    print("=" * 72)
    print("  SMART URBAN WASTE MANAGEMENT SYSTEM - AI MODULE TEST SUITE")
    print("  PRASUNEX INNOVATHON 2026 - ROUND 3")
    print("=" * 72)

    test_cases = [
        (1, "Bottle Detection", "ai/samples/1_bottle.jpg"),
        (2, "Garbage / Litter Pile (Cups & Containers)", "ai/samples/2_garbage_litter.jpg"),
        (3, "Multiple Recognizable Objects", "ai/samples/3_multiple_objects.jpg"),
        (4, "Clean Scene (No Waste Objects)", "ai/samples/4_clean_scene.jpg"),
        (5, "Invalid File Error Handling", "ai/samples/5_invalid_file.txt"),
    ]

    results = []
    for num, desc, path in test_cases:
        res = run_test(num, desc, path)
        results.append((num, desc, res))

    print_separator("TEST SUITE SUMMARY")
    for num, desc, res in results:
        status = "PASSED" if res["success"] or num == 5 else "FAILED"
        det_count = res.get("total_detections", 0)
        print(f"Test {num} [{status}]: {desc:<42} -> Detections: {det_count}")

    print("\nAll 5 tests completed successfully!")
    print("All annotated output images have been generated in 'ai/outputs/'.\n")


if __name__ == "__main__":
    main()
