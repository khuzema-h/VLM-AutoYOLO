"""Tests for compare metrics service."""

from __future__ import annotations

from app.services.compare_metrics import (
    accumulate_metrics,
    apply_label_map_to_boxes,
    box_iou,
    compute_image_metrics,
    finalize_merged_metrics,
    merge_image_metrics,
    _empty_class_counters,
)


def test_box_iou_full_overlap():
    box = {"x1": 0, "y1": 0, "x2": 10, "y2": 10}
    assert box_iou(box, box) == 1.0


def test_apply_label_map_counts_unmapped():
    boxes = [{"className": "a", "x1": 0, "y1": 0, "x2": 1, "y2": 1}]
    mapped, unmapped = apply_label_map_to_boxes(boxes, {"a": "Berry"})
    assert mapped[0]["className"] == "Berry"
    assert unmapped == 0

    _, unmapped2 = apply_label_map_to_boxes(boxes, {"a": ""})
    assert unmapped2 == 1


def test_accumulate_metrics_perfect_match():
    gt = [{"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    pred = [{"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    result = accumulate_metrics(
        gt_boxes=gt,
        pred_boxes=pred,
        unmapped_vlm=0,
        class_names=["Berry"],
        iou_threshold=0.5,
    )
    assert result["global"]["tp"] == 1
    assert result["global"]["fp"] == 0
    assert result["global"]["fn"] == 0
    assert result["global"]["f1"] == 1.0


def test_compute_image_metrics():
    gt = [{"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    pred = [
        {"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10},
        {"className": "Berry", "x1": 50, "y1": 50, "x2": 60, "y2": 60},
    ]
    result = compute_image_metrics(
        gt_boxes=gt,
        pred_boxes=pred,
        unmapped_vlm=0,
        class_names=["Berry"],
        iou_threshold=0.5,
    )
    assert result["tp"] == 1
    assert result["fp"] == 1
    assert result["fn"] == 0
    assert result["classStats"]["Berry"]["fp"] == 1


def test_merge_image_metrics_matches_single_image():
    gt = [{"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    pred = [{"className": "Berry", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]
    single = accumulate_metrics(
        gt_boxes=gt,
        pred_boxes=pred,
        unmapped_vlm=0,
        class_names=["Berry"],
        iou_threshold=0.5,
    )

    counters = _empty_class_counters(["Berry"])
    merge_image_metrics(
        counters,
        gt_boxes=gt,
        pred_boxes=pred,
        class_names=["Berry"],
        iou_threshold=0.5,
    )
    merged = finalize_merged_metrics(
        counters,
        class_names=["Berry"],
        unmapped_vlm=0,
        gt_total=1,
        vlm_total=1,
    )
    assert merged["global"]["tp"] == single["global"]["tp"]
    assert merged["global"]["f1"] == single["global"]["f1"]
