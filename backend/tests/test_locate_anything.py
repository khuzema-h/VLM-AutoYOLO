from __future__ import annotations

from app.services.crop_verify import (
    crop_box_image,
    parse_verification_answer,
)
from app.services.locate_anything import (
    filter_boxes_by_max_area,
    filter_boxes_by_min_confidence,
    parse_boxes,
)


def test_parse_boxes_single():
    raw = "<ref>cat</ref><box><100><200><300><400></box>"
    boxes = parse_boxes(raw, 1000, 1000)
    assert len(boxes) == 1
    assert boxes[0] == {
        "class_name": "cat",
        "x1": 100,
        "y1": 200,
        "x2": 300,
        "y2": 400,
        "confidence": None,
    }


def test_parse_boxes_multiple_boxes_same_ref():
    raw = "<ref>dog</ref><box><100><200><300><400></box><box><500><600><700><800></box>"
    boxes = parse_boxes(raw, 1000, 1000)
    assert len(boxes) == 2
    assert boxes[0] == {
        "class_name": "dog",
        "x1": 100,
        "y1": 200,
        "x2": 300,
        "y2": 400,
        "confidence": None,
    }
    assert boxes[1] == {
        "class_name": "dog",
        "x1": 500,
        "y1": 600,
        "x2": 700,
        "y2": 800,
        "confidence": None,
    }


def test_parse_boxes_switched_refs():
    raw = (
        "<ref>cat</ref><box><100><200><300><400></box>"
        "<ref>bird</ref><box><500><600><700><800></box>"
    )
    boxes = parse_boxes(raw, 1000, 1000)
    assert len(boxes) == 2
    assert boxes[0]["class_name"] == "cat"
    assert boxes[1]["class_name"] == "bird"


def test_parse_boxes_empty_or_invalid():
    assert parse_boxes("", 1000, 1000) == []
    assert parse_boxes("some random text without tags", 1000, 1000) == []
    assert parse_boxes("<ref>empty box</ref>", 1000, 1000) == []
    assert parse_boxes("<box><1><2><3><4></box>", 1000, 1000) == []


def test_filter_boxes_by_min_confidence():
    boxes = [
        {"class_name": "high", "confidence": 0.9, "x1": 0, "y1": 0, "x2": 10, "y2": 10},
        {"class_name": "low", "confidence": 0.2, "x1": 0, "y1": 0, "x2": 10, "y2": 10},
        {"class_name": "none", "confidence": None, "x1": 0, "y1": 0, "x2": 10, "y2": 10},
    ]
    filtered = filter_boxes_by_min_confidence(boxes, 0.5)
    assert len(filtered) == 2
    assert {b["class_name"] for b in filtered} == {"high", "none"}
    assert filter_boxes_by_min_confidence(boxes, 0.0) == boxes


def test_filter_boxes_by_max_area():
    boxes = [
        {"class_name": "small", "x1": 0, "y1": 0, "x2": 100, "y2": 100},
        {"class_name": "large", "x1": 0, "y1": 0, "x2": 900, "y2": 900},
    ]
    filtered = filter_boxes_by_max_area(boxes, 1000, 1000, 0.5)
    assert len(filtered) == 1
    assert filtered[0]["class_name"] == "small"
    assert filter_boxes_by_max_area(boxes, 1000, 1000, 1.0) == boxes


def test_parse_verification_answer():
    assert parse_verification_answer("yes") is True
    assert parse_verification_answer("No, there is no cat.") is False
    assert parse_verification_answer("maybe") is True
    assert parse_verification_answer("I think the answer is yes.") is True


def test_crop_box_image_padding():
    from PIL import Image

    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    box = {"x1": 40, "y1": 40, "x2": 60, "y2": 60}
    crop = crop_box_image(img, box, padding_ratio=0.5)
    assert crop.size[0] >= 20
    assert crop.size[1] >= 20
