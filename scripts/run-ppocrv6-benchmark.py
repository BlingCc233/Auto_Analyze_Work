#!/usr/bin/env python3

import argparse
import json
import os
import time
from pathlib import Path

import cv2
from paddleocr import PaddleOCR


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def image_files(inputs):
    files = []
    for raw in inputs:
        path = Path(raw)
        if path.is_dir():
            files.extend(
                entry
                for entry in path.rglob("*")
                if entry.is_file() and entry.suffix.lower() in IMAGE_SUFFIXES
            )
        elif path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            files.append(path)
    return sorted(set(files), key=lambda path: str(path))


def ordered_text(result):
    data = result.json
    if isinstance(data, str):
        data = json.loads(data)
    payload = data.get("res", data)
    texts = payload.get("rec_texts") or []
    scores = payload.get("rec_scores") or []
    polygons = payload.get("rec_polys") or payload.get("dt_polys") or []
    entries = []
    for index, text in enumerate(texts):
        value = str(text).strip()
        if not value:
            continue
        polygon = polygons[index] if index < len(polygons) else []
        xs = [point[0] for point in polygon] if polygon else [0]
        ys = [point[1] for point in polygon] if polygon else [index]
        entries.append(
            {
                "text": value,
                "score": float(scores[index]) if index < len(scores) else 0.0,
                "x": min(xs),
                "y": min(ys),
            }
        )
    entries.sort(key=lambda entry: (entry["y"], entry["x"]))
    return "\n".join(entry["text"] for entry in entries), entries


def time_crop_text(ocr, image):
    if image is None:
        return ""
    height, width = image.shape[:2]
    crop = image[
        int(height * 0.50) : int(height * 0.68),
        0 : int(width * 0.42),
    ]
    if crop.size == 0:
        return ""
    results = list(ocr.predict(crop))
    text, _entries = ordered_text(results[0]) if results else ("", [])
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    files = image_files(args.inputs)
    if not files:
        raise SystemExit("No images found")

    started = time.perf_counter()
    ocr = PaddleOCR(
        text_detection_model_name="PP-OCRv6_tiny_det",
        text_recognition_model_name="PP-OCRv6_tiny_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    rows = []
    for index, path in enumerate(files, start=1):
        image_started = time.perf_counter()
        image = cv2.imread(str(path))
        height, width = image.shape[:2] if image is not None else (0, 0)
        results = list(ocr.predict(str(path)))
        text, entries = ordered_text(results[0]) if results else ("", [])
        time_text = time_crop_text(ocr, image)
        rows.append(
            {
                "file": path.as_posix(),
                "text": text,
                "timeText": time_text,
                "width": width,
                "height": height,
                "lines": entries,
                "confidence": (
                    sum(entry["score"] for entry in entries) / len(entries) * 100
                    if entries
                    else 0
                ),
                "durationMs": round((time.perf_counter() - image_started) * 1000),
            }
        )
        print(f"[{index}/{len(files)}] {path} ({rows[-1]['durationMs']} ms)", flush=True)

    Path(args.output).write_text(
        json.dumps(
            {
                "engine": "PP-OCRv6_tiny",
                "totalDurationMs": round((time.perf_counter() - started) * 1000),
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
