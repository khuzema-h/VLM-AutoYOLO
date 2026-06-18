"""VLM-AutoYOLO native project format — full round-trip for the annotation editor."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.detection import Detection

PROJECT_FORMAT = "vlm-autoyolo-project"
PROJECT_VERSION = 1


def _detection_to_item(det: Detection, image_file: str) -> dict:
    return {
        "image_file": image_file,
        "image_name": det.image_name,
        "image_width": det.image_width,
        "image_height": det.image_height,
        "categories": list(det.categories or []),
        "model_type": det.model_type.value if det.model_type else None,
        "filter_mode": det.filter_mode.value if det.filter_mode else None,
        "filter_nms_iou": det.filter_nms_iou,
        "boxes": [
            {
                "class_name": b.class_name,
                "x1": b.x1,
                "y1": b.y1,
                "x2": b.x2,
                "y2": b.y2,
                "confidence": b.confidence,
                "mask_polygon": b.mask_polygon,
            }
            for b in det.boxes
        ],
    }


def export_project_zip(detections: list[Detection]) -> bytes:
    """Export images + manifest for re-import in the BBox Review editor."""
    buf = io.BytesIO()
    seen_names: dict[str, int] = {}

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        items: list[dict] = []
        for det in detections:
            stem = Path(det.image_name).stem or "image"
            if stem in seen_names:
                seen_names[stem] += 1
                stem = f"{stem}_{seen_names[stem]}"
            else:
                seen_names[stem] = 1

            suffix = Path(det.image_name).suffix or ".jpg"
            image_file = f"images/{stem}{suffix}"
            zf.write(det.image_path, image_file)
            items.append(_detection_to_item(det, image_file))

        manifest = {
            "format": PROJECT_FORMAT,
            "version": PROJECT_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "item_count": len(items),
            "items": items,
        }
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
        )

    buf.seek(0)
    return buf.getvalue()
