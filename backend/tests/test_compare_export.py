"""Tests for VLM dataset export helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes.compare import (
    _apply_label_map_to_boxes,
    _boxes_to_yolo_txt,
    _resolve_export_class_names,
    export_vlm_dataset_to_yolo,
)


def test_resolve_export_class_names_uses_gt_when_mapped():
    names = _resolve_export_class_names(
        {"berry": "Berry"},
        ["berry"],
        ["Berry", "Red Leaf"],
    )
    assert names == ["Berry", "Red Leaf"]


def test_resolve_export_class_names_uses_vlm_labels_without_mapping():
    names = _resolve_export_class_names({}, ["ripe berry"], ["Berry"])
    assert names == ["ripe berry"]


def test_apply_label_map_drops_unmapped():
    boxes = [{"className": "a", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    mapped = _apply_label_map_to_boxes(boxes, {"a": "Berry"})
    assert mapped[0]["className"] == "Berry"
    assert _apply_label_map_to_boxes(boxes, {"a": ""}) == []


def test_boxes_to_yolo_txt_normalized():
    txt = _boxes_to_yolo_txt(
        [{"className": "Berry", "x1": 10, "y1": 20, "x2": 30, "y2": 40}],
        {"Berry": 0},
        100,
        100,
    )
    assert txt == "0 0.200000 0.300000 0.200000 0.200000"


def test_export_vlm_dataset_to_yolo(tmp_path: Path):
    source = tmp_path / "source"
    output = tmp_path / "exported"
    (source / "images" / "train").mkdir(parents=True)
    (source / "labels" / "train").mkdir(parents=True)

    img = source / "images" / "train" / "a.jpg"
    img.write_bytes(
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19\x1a%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd5\xff\xd9"
    )
    (source / "labels" / "train" / "a.txt").write_text("0 0.5 0.5 0.1 0.1\n")
    (source / "data.yaml").write_text(
        "train: images/train\nval: images/train\ntest: images/train\nnames:\n  0: Berry\n"
    )
    (source / "split_manifest.json").write_text(json.dumps({"a.jpg": "train"}))
    (source / "vlm_cache.json").write_text(
        json.dumps(
            {
                "images/train/a.jpg": [
                    {"className": "Berry", "x1": 10, "y1": 10, "x2": 20, "y2": 20}
                ]
            }
        )
    )

    result = export_vlm_dataset_to_yolo(
        source_dir=source,
        output_dir=output,
        vlm_labels=["Berry"],
        default_classes=["Berry"],
        max_bbox_area=1.0,
        min_confidence=0.0,
        label_map={},
    )

    assert result["exportedImages"] == 1
    assert (output / "images" / "train" / "a.jpg").exists()
    assert (output / "labels" / "train" / "a.txt").exists()
    assert (output / "data.yaml").exists()
    assert (output / "split_manifest.json").exists()
    assert "0 " in (output / "labels" / "train" / "a.txt").read_text()


def test_export_fails_without_cache(tmp_path: Path):
    source = tmp_path / "source"
    output = tmp_path / "exported"
    (source / "images" / "train").mkdir(parents=True)
    img = source / "images" / "train" / "a.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")
    (source / "data.yaml").write_text("names:\n  0: Berry\n")
    (source / "split_manifest.json").write_text(json.dumps({"a.jpg": "train"}))

    with pytest.raises(HTTPException) as exc:
        export_vlm_dataset_to_yolo(
            source_dir=source,
            output_dir=output,
            vlm_labels=["Berry"],
            default_classes=["Berry"],
            max_bbox_area=1.0,
            min_confidence=0.0,
            label_map={},
        )
    assert exc.value.status_code == 400
