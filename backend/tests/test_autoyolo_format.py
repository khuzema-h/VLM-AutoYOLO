"""Tests for VLM-AutoYOLO project export/import."""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import MagicMock

from app.services.autoyolo_format import PROJECT_FORMAT, export_project_zip
from app.services.dataset_import.autoyolo import parse_autoyolo_zip


def _make_detection(
    *,
    image_path: str,
    image_name: str = "test.jpg",
    width: int = 100,
    height: int = 100,
    categories: list[str] | None = None,
    boxes: list | None = None,
):
    det = MagicMock()
    det.image_path = image_path
    det.image_name = image_name
    det.image_width = width
    det.image_height = height
    det.categories = categories or ["cat"]
    det.model_type = None
    det.filter_mode = None
    det.filter_nms_iou = None
    det.boxes = boxes or []
    return det


def test_export_and_parse_project_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        img_path = Path(tmp) / "test.jpg"
        img_path.write_bytes(b"fake-image")

        box = MagicMock()
        box.class_name = "cat"
        box.x1, box.y1, box.x2, box.y2 = 10, 20, 40, 50
        box.confidence = 0.9
        box.mask_polygon = [[10.0, 20.0], [40.0, 20.0], [40.0, 50.0]]

        det = _make_detection(image_path=str(img_path), boxes=[box])
        zip_bytes = export_project_zip([det])

        extract = Path(tmp) / "extract"
        extract.mkdir()
        with zipfile.ZipFile(zip_bytes) as zf:
            zf.extractall(extract)

        manifest = json.loads((extract / "manifest.json").read_text())
        assert manifest["format"] == PROJECT_FORMAT
        assert manifest["item_count"] == 1
        assert manifest["items"][0]["boxes"][0]["class_name"] == "cat"
        assert manifest["items"][0]["boxes"][0]["mask_polygon"] is not None

        parsed = parse_autoyolo_zip(str(extract))
        assert len(parsed) == 1
        assert parsed[0]["image_name"] == "test.jpg"
        assert parsed[0]["categories"] == ["cat"]
        assert parsed[0]["boxes"][0]["class_name"] == "cat"
        assert parsed[0]["boxes"][0]["mask_polygon"] is not None
