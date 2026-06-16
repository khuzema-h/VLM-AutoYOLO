"""Shared YOLO label format utilities — single source of truth."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .box_filter import apply_filter

if TYPE_CHECKING:
    from ..models.detection import Detection

_MIN_BOX_PX = 2


def _clamp_box(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    img_w: int,
    img_h: int,
) -> tuple[int, int, int, int] | None:
    """Clamp bbox to image bounds; return None if too small after clamp."""
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1

    x1 = max(0, min(x1, img_w))
    x2 = max(0, min(x2, img_w))
    y1 = max(0, min(y1, img_h))
    y2 = max(0, min(y2, img_h))

    if x2 - x1 < _MIN_BOX_PX or y2 - y1 < _MIN_BOX_PX:
        return None
    return x1, y1, x2, y2


def _clamp_polygon(poly: list, img_w: int, img_h: int) -> list[list[float]] | None:
    if not poly or len(poly) < 3:
        return None
    clamped = [
        [max(0.0, min(float(p[0]), float(img_w))), max(0.0, min(float(p[1]), float(img_h)))]
        for p in poly
        if len(p) >= 2
    ]
    return clamped if len(clamped) >= 3 else None


def _export_class_name(class_name: str, label_map: dict[str, str] | None = None) -> str:
    """Map a stored class name to the export name (identity when unmapped)."""
    if not label_map:
        return class_name
    renamed = label_map.get(class_name, "").strip()
    return renamed or class_name


def _get_filtered_boxes(detection: Detection) -> list[dict]:
    """Return boxes after applying saved filter settings, if any."""
    boxes = [
        {
            "x1": b.x1,
            "y1": b.y1,
            "x2": b.x2,
            "y2": b.y2,
            "class_name": b.class_name,
            "mask_polygon": getattr(b, "mask_polygon", None),
        }
        for b in detection.boxes
    ]
    return apply_filter(boxes, detection.filter_mode, detection.filter_nms_iou)


def detection_to_yolo(
    detection: Detection,
    class_map: dict[str, int],
    label_map: dict[str, str] | None = None,
) -> str:
    """Convert a detection record to YOLO label string.

    Format: class_id x_center y_center width height  (all normalized 0–1)
    Applies saved filter settings if present.
    """
    img_w = detection.image_width or 1
    img_h = detection.image_height or 1
    boxes = _get_filtered_boxes(detection)
    lines: list[str] = []

    for box in boxes:
        class_id = class_map[_export_class_name(box["class_name"], label_map)]
        clamped = _clamp_box(box["x1"], box["y1"], box["x2"], box["y2"], img_w, img_h)
        if clamped is None:
            continue
        x1, y1, x2, y2 = clamped
        x_center = ((x1 + x2) / 2) / img_w
        y_center = ((y1 + y2) / 2) / img_h
        bw = (x2 - x1) / img_w
        bh = (y2 - y1) / img_h
        lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {bw:.6f} {bh:.6f}")

    return "\n".join(lines)


def detection_to_yolo_seg(
    detection: Detection,
    class_map: dict[str, int],
    label_map: dict[str, str] | None = None,
) -> str:
    """Convert to YOLO segmentation format.

    Format: class_id x1 y1 x2 y2 ... xn yn  (normalized 0–1 polygon points)
    Falls back to bbox if no mask_polygon.
    """
    img_w = detection.image_width or 1
    img_h = detection.image_height or 1
    boxes = _get_filtered_boxes(detection)
    lines: list[str] = []

    for box in boxes:
        class_id = class_map[_export_class_name(box["class_name"], label_map)]
        poly = box.get("mask_polygon")
        if poly and len(poly) >= 3:
            clamped_poly = _clamp_polygon(poly, img_w, img_h)
            if clamped_poly is None:
                continue
            pts = " ".join(f"{p[0] / img_w:.6f} {p[1] / img_h:.6f}" for p in clamped_poly)
            lines.append(f"{class_id} {pts}")
        else:
            clamped = _clamp_box(box["x1"], box["y1"], box["x2"], box["y2"], img_w, img_h)
            if clamped is None:
                continue
            x1, y1, x2, y2 = clamped
            x_center = ((x1 + x2) / 2) / img_w
            y_center = ((y1 + y2) / 2) / img_h
            bw = (x2 - x1) / img_w
            bh = (y2 - y1) / img_h
            lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {bw:.6f} {bh:.6f}")

    return "\n".join(lines)
