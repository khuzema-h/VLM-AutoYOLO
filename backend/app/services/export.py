from __future__ import annotations

import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import TYPE_CHECKING

from .autoyolo_format import export_project_zip
from .coco_format import export_coco_json
from .createml_format import export_createml_json
from .voc_format import detection_to_voc
from .yolo_format import (
    _export_class_name,
    _get_filtered_boxes,
    detection_to_yolo,
    detection_to_yolo_seg,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models.detection import Detection

FORMAT_LABELS = {
    "autoyolo": "VLM-AutoYOLO Project",
    "yolo": "YOLO",
    "yolo-seg": "YOLO Segmentation",
    "coco": "COCO JSON",
    "voc": "Pascal VOC",
    "createml": "CreateML JSON",
}


def export_single(db: Session, detection_id: str) -> tuple[str, str]:
    """Return (yolo_content, image_name) for a single detection."""
    from ..models.detection import Detection

    det = db.query(Detection).filter(Detection.id == detection_id).first()
    if not det:
        raise ValueError(f"Detection not found: {detection_id}")

    class_map = _build_class_map([det])
    return detection_to_yolo(det, class_map), det.image_name


def export_single_zip(db: Session, detection_id: str, format: str = "yolo") -> bytes:
    """Export a single detection as a zip in the requested format."""
    return export_batch(db, [detection_id], format=format)


def export_batch(
    db: Session,
    detection_ids: list[str],
    format: str = "yolo",
    label_map: dict[str, str] | None = None,
) -> bytes:
    """Export multiple detections as a zip file in the requested format."""
    from ..models.detection import Detection

    dets: list[Detection] = []
    for det_id in detection_ids:
        det = db.query(Detection).filter(Detection.id == det_id).first()
        if det:
            dets.append(det)

    unified_map = _build_class_map(dets, label_map)

    if format == "autoyolo":
        return export_project_zip(dets)
    if format == "yolo":
        return _export_yolo(dets, unified_map, label_map=label_map)
    if format == "yolo-seg":
        return _export_yolo(dets, unified_map, seg_mode=True, label_map=label_map)
    if format == "coco":
        return _export_coco(dets, unified_map, label_map=label_map)
    if format == "voc":
        return _export_voc(dets, unified_map, label_map=label_map)
    if format == "createml":
        return _export_createml(dets, unified_map, label_map=label_map)
    raise ValueError(f"Unsupported format: {format}. Supported: {list(FORMAT_LABELS)}")


def _export_yolo(
    dets: list[Detection],
    unified_map: dict[str, int],
    seg_mode: bool = False,
    label_map: dict[str, str] | None = None,
) -> bytes:
    fmt_fn = detection_to_yolo_seg if seg_mode else detection_to_yolo
    label_dir = "labels"
    buf = io.BytesIO()
    seen_names: dict[str, int] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for det in dets:
            base = _unique_base(det, seen_names)
            zf.writestr(f"{label_dir}/{base}.txt", fmt_fn(det, unified_map, label_map))
            zf.write(det.image_path, f"images/{base}{Path(det.image_name).suffix}")
        names = {i: name for name, i in sorted(unified_map.items(), key=lambda x: x[1])}
        zf.writestr("data.yaml", f"nc: {len(names)}\nnames: {json.dumps(names)}\n")
    buf.seek(0)
    return buf.getvalue()


def _export_coco(
    dets: list[Detection],
    unified_map: dict[str, int],
    label_map: dict[str, str] | None = None,
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("annotations.json", export_coco_json(dets, unified_map, label_map))
        for det in dets:
            zf.write(det.image_path, f"images/{Path(det.image_name).name}")
    buf.seek(0)
    return buf.getvalue()


def _export_voc(
    dets: list[Detection],
    unified_map: dict[str, int],
    label_map: dict[str, str] | None = None,
) -> bytes:
    buf = io.BytesIO()
    seen_names: dict[str, int] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for det in dets:
            base = _unique_base(det, seen_names)
            zf.writestr(f"{base}.xml", detection_to_voc(det, unified_map, label_map))
            zf.write(det.image_path, f"images/{Path(det.image_name).name}")
    buf.seek(0)
    return buf.getvalue()


def _export_createml(
    dets: list[Detection],
    unified_map: dict[str, int],
    label_map: dict[str, str] | None = None,
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("annotations.json", export_createml_json(dets, unified_map, label_map))
        for det in dets:
            zf.write(det.image_path, f"images/{Path(det.image_name).name}")
    buf.seek(0)
    return buf.getvalue()


def _unique_base(det: Detection, seen_names: dict[str, int]) -> str:
    base = Path(det.image_name).stem or str(uuid.uuid4())[:8]
    if base in seen_names:
        seen_names[base] += 1
        base = f"{base}_{seen_names[base]}"
    else:
        seen_names[base] = 1
    return base


def _build_class_map(
    detections: list[Detection],
    label_map: dict[str, str] | None = None,
) -> dict[str, int]:
    """Build a unified export class_name → class_id mapping across all detections."""
    class_map: dict[str, int] = {}
    for det in detections:
        for box in _get_filtered_boxes(det):
            export_name = _export_class_name(box["class_name"], label_map)
            if export_name not in class_map:
                class_map[export_name] = len(class_map)
    return class_map
