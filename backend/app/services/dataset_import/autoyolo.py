"""VLM-AutoYOLO native project format parser."""

import json
import logging
from pathlib import Path

from .helpers import save_image
from ..autoyolo_format import PROJECT_FORMAT

logger = logging.getLogger(__name__)


def parse_autoyolo_zip(extract_dir: str) -> list[dict]:
    extract = Path(extract_dir)
    manifest_path = extract / "manifest.json"
    if not manifest_path.exists():
        raise ValueError("Project ZIP must contain manifest.json at the root")

    data = json.loads(manifest_path.read_text())
    if data.get("format") != PROJECT_FORMAT:
        raise ValueError(
            f"Unsupported project format: {data.get('format')!r}. "
            f"Expected {PROJECT_FORMAT!r}"
        )

    items_raw = data.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        raise ValueError("Project manifest has no items")

    items: list[dict] = []
    for entry in items_raw:
        image_file = entry.get("image_file") or entry.get("imageFile")
        if not image_file:
            logger.warning("Skipping item without image_file")
            continue

        src = extract / image_file
        if not src.exists():
            logger.warning("Image missing in project: %s", image_file)
            continue

        image_name = entry.get("image_name") or entry.get("imageName") or src.name
        saved_path = save_image(str(src), Path(image_name).name)

        boxes: list[dict] = []
        for box in entry.get("boxes") or []:
            try:
                boxes.append(
                    {
                        "class_name": box.get("class_name") or box.get("className") or "object",
                        "x1": int(box["x1"]),
                        "y1": int(box["y1"]),
                        "x2": int(box["x2"]),
                        "y2": int(box["y2"]),
                        "confidence": box.get("confidence"),
                        "mask_polygon": box.get("mask_polygon") or box.get("maskPolygon"),
                    }
                )
            except (KeyError, TypeError, ValueError):
                logger.warning("Skipping invalid box in %s", image_name)
                continue

        categories = entry.get("categories") or []
        if categories and isinstance(categories[0], list):
            categories = categories[0]

        items.append(
            {
                "image_path": saved_path,
                "image_name": Path(image_name).name,
                "image_width": int(entry.get("image_width") or entry.get("imageWidth") or 0),
                "image_height": int(entry.get("image_height") or entry.get("imageHeight") or 0),
                "categories": list(categories),
                "model_type": entry.get("model_type") or entry.get("modelType"),
                "filter_mode": entry.get("filter_mode") or entry.get("filterMode"),
                "filter_nms_iou": entry.get("filter_nms_iou") or entry.get("filterNmsIou"),
                "boxes": boxes,
            }
        )

    if not items:
        raise ValueError("No valid items found in project manifest")
    return items
