#!/usr/bin/env python3

import argparse
import json
import os
import sys
import time

import cv2
from paddleocr import PaddleOCR


def result_payload(result):
    data = result.json
    if isinstance(data, str):
        data = json.loads(data)
    return data.get("res", data)


def ordered_lines(result):
    payload = result_payload(result)
    texts = payload.get("rec_texts") or []
    scores = payload.get("rec_scores") or []
    polygons = payload.get("rec_polys") or payload.get("dt_polys") or []
    lines = []
    for index, text in enumerate(texts):
        value = str(text).strip()
        if not value:
            continue
        polygon = polygons[index] if index < len(polygons) else []
        xs = [point[0] for point in polygon] if polygon else [0]
        ys = [point[1] for point in polygon] if polygon else [index]
        lines.append(
            {
                "text": value,
                "score": float(scores[index]) if index < len(scores) else 0.0,
                "x": int(min(xs)),
                "y": int(min(ys)),
            }
        )
    return sorted(lines, key=lambda line: (line["y"], line["x"]))


def recognize(ocr, image_path):
    started = time.perf_counter()
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError("无法读取图片")
    height, width = image.shape[:2]
    full_results = list(ocr.predict(image))
    lines = ordered_lines(full_results[0]) if full_results else []

    time_crop = image[
        int(height * 0.50) : int(height * 0.68),
        0 : int(width * 0.42),
    ]
    time_results = list(ocr.predict(time_crop)) if time_crop.size else []
    time_lines = ordered_lines(time_results[0]) if time_results else []
    confidence = (
        sum(line["score"] for line in lines) / len(lines) * 100
        if lines
        else 0
    )
    return {
        "ok": True,
        "engine": "ppocrv6-tiny",
        "width": width,
        "height": height,
        "lines": lines,
        "timeLines": time_lines,
        "confidence": confidence,
        "durationMs": round((time.perf_counter() - started) * 1000),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--det-model", required=True)
    parser.add_argument("--rec-model", required=True)
    args = parser.parse_args()
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

    ocr = PaddleOCR(
        text_detection_model_name="PP-OCRv6_tiny_det",
        text_detection_model_dir=args.det_model,
        text_recognition_model_name="PP-OCRv6_tiny_rec",
        text_recognition_model_dir=args.rec_model,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    print(json.dumps({"ready": True}), flush=True)
    for raw in sys.stdin:
        try:
            request = json.loads(raw)
            response = {
                "id": request.get("id"),
                **recognize(ocr, str(request.get("imagePath") or "")),
            }
        except Exception as error:
            response = {
                "id": request.get("id") if "request" in locals() else None,
                "ok": False,
                "error": str(error)[:300],
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
