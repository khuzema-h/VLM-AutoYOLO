"""Dataset-wide compare metrics (VLM vs ground truth)."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def box_iou(box1: dict[str, Any], box2: dict[str, Any]) -> float:
    ix1 = max(box1["x1"], box2["x1"])
    iy1 = max(box1["y1"], box2["y1"])
    ix2 = min(box1["x2"], box2["x2"])
    iy2 = min(box1["y2"], box2["y2"])

    intersection = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area1 = (box1["x2"] - box1["x1"]) * (box1["y2"] - box1["y1"])
    area2 = (box2["x2"] - box2["x1"]) * (box2["y2"] - box2["y1"])
    union = area1 + area2 - intersection
    return intersection / union if union > 0 else 0.0


def apply_label_map_to_boxes(
    boxes: list[dict[str, Any]],
    label_map: dict[str, str],
) -> tuple[list[dict[str, Any]], int]:
    if not label_map:
        return boxes, 0
    mapped: list[dict[str, Any]] = []
    unmapped = 0
    for box in boxes:
        gt_class = label_map.get(box.get("className", ""), "")
        if gt_class:
            mapped.append({**box, "className": gt_class})
        else:
            unmapped += 1
    return mapped, unmapped


def parse_yolo_label_file(
    label_path: Path,
    names_map: dict[int, str],
    img_w: int,
    img_h: int,
) -> list[dict[str, Any]]:
    boxes: list[dict[str, Any]] = []
    if not label_path.exists():
        return boxes

    for line in label_path.read_text(encoding="utf-8").strip().splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        try:
            class_id = int(parts[0])
            x_c = float(parts[1])
            y_c = float(parts[2])
            w = float(parts[3])
            h = float(parts[4])

            x1 = int((x_c - w / 2) * img_w)
            y1 = int((y_c - h / 2) * img_h)
            x2 = int((x_c + w / 2) * img_w)
            y2 = int((y_c + h / 2) * img_h)

            boxes.append(
                {
                    "className": names_map.get(class_id, f"class_{class_id}"),
                    "x1": max(0, x1),
                    "y1": max(0, y1),
                    "x2": min(img_w, x2),
                    "y2": min(img_h, y2),
                }
            )
        except (TypeError, ValueError):
            continue
    return boxes


def _match_class_boxes(
    gt_boxes: list[dict[str, Any]],
    pred_boxes: list[dict[str, Any]],
    iou_threshold: float,
) -> tuple[int, int, int, float]:
    pairs: list[tuple[int, int, float]] = []
    for gt_idx, gt in enumerate(gt_boxes):
        for pred_idx, pred in enumerate(pred_boxes):
            iou = box_iou(gt, pred)
            if iou >= iou_threshold:
                pairs.append((gt_idx, pred_idx, iou))

    pairs.sort(key=lambda item: item[2], reverse=True)

    matched_gt: set[int] = set()
    matched_pred: set[int] = set()
    tp = 0
    iou_sum = 0.0

    for gt_idx, pred_idx, iou in pairs:
        if gt_idx in matched_gt or pred_idx in matched_pred:
            continue
        matched_gt.add(gt_idx)
        matched_pred.add(pred_idx)
        tp += 1
        iou_sum += iou

    fp = len(pred_boxes) - tp
    fn = len(gt_boxes) - tp
    return tp, fp, fn, iou_sum


def _ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator > 0 else 0.0


def _f1(precision: float, recall: float) -> float:
    return (2 * precision * recall) / (precision + recall) if precision + recall > 0 else 0.0


def accumulate_metrics(
    *,
    gt_boxes: list[dict[str, Any]],
    pred_boxes: list[dict[str, Any]],
    unmapped_vlm: int,
    class_names: list[str],
    iou_threshold: float,
) -> dict[str, Any]:
    total_tp = 0
    total_fp = 0
    total_fn = 0
    total_iou_sum = 0.0
    class_stats: list[dict[str, Any]] = []

    for cls in class_names:
        cls_gt = [b for b in gt_boxes if b["className"] == cls]
        cls_pred = [b for b in pred_boxes if b["className"] == cls]
        tp, fp, fn, iou_sum = _match_class_boxes(cls_gt, cls_pred, iou_threshold)

        precision = _ratio(tp, tp + fp)
        recall = _ratio(tp, tp + fn)

        total_tp += tp
        total_fp += fp
        total_fn += fn
        total_iou_sum += iou_sum

        class_stats.append(
            {
                "className": cls,
                "gtCount": len(cls_gt),
                "vlmCount": len(cls_pred),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision": precision,
                "recall": recall,
                "f1": _f1(precision, recall),
                "meanIou": _ratio(iou_sum, tp),
            }
        )

    total_fp += unmapped_vlm
    precision = _ratio(total_tp, total_tp + total_fp)
    recall = _ratio(total_tp, total_tp + total_fn)

    return {
        "global": {
            "tp": total_tp,
            "fp": total_fp,
            "fn": total_fn,
            "gtTotal": len(gt_boxes),
            "vlmTotal": len(pred_boxes) + unmapped_vlm,
            "unmappedVlm": unmapped_vlm,
            "precision": precision,
            "recall": recall,
            "f1": _f1(precision, recall),
            "meanIou": _ratio(total_iou_sum, total_tp),
        },
        "classStats": class_stats,
    }


def _empty_class_counters(class_names: list[str]) -> dict[str, dict[str, float | int]]:
    return {
        cls: {
            "tp": 0,
            "fp": 0,
            "fn": 0,
            "iouSum": 0.0,
            "gtCount": 0,
            "vlmCount": 0,
        }
        for cls in class_names
    }


def merge_image_metrics(
    counters: dict[str, dict[str, float | int]],
    *,
    gt_boxes: list[dict[str, Any]],
    pred_boxes: list[dict[str, Any]],
    class_names: list[str],
    iou_threshold: float,
) -> None:
    """Merge per-image matching stats into running dataset totals."""
    per_image = accumulate_metrics(
        gt_boxes=gt_boxes,
        pred_boxes=pred_boxes,
        unmapped_vlm=0,
        class_names=class_names,
        iou_threshold=iou_threshold,
    )
    for row in per_image["classStats"]:
        bucket = counters[row["className"]]
        bucket["tp"] = int(bucket["tp"]) + row["tp"]
        bucket["fp"] = int(bucket["fp"]) + row["fp"]
        bucket["fn"] = int(bucket["fn"]) + row["fn"]
        bucket["iouSum"] = float(bucket["iouSum"]) + row["tp"] * row["meanIou"]
        bucket["gtCount"] = int(bucket["gtCount"]) + row["gtCount"]
        bucket["vlmCount"] = int(bucket["vlmCount"]) + row["vlmCount"]


def compute_image_metrics(
    *,
    gt_boxes: list[dict[str, Any]],
    pred_boxes: list[dict[str, Any]],
    unmapped_vlm: int,
    class_names: list[str],
    iou_threshold: float,
) -> dict[str, Any]:
    """Per-image metrics used for report case investigation."""
    result = accumulate_metrics(
        gt_boxes=gt_boxes,
        pred_boxes=pred_boxes,
        unmapped_vlm=unmapped_vlm,
        class_names=class_names,
        iou_threshold=iou_threshold,
    )
    class_stats: dict[str, dict[str, int]] = {}
    for row in result["classStats"]:
        if row["gtCount"] or row["vlmCount"] or row["tp"] or row["fp"] or row["fn"]:
            class_stats[row["className"]] = {
                "gtCount": row["gtCount"],
                "vlmCount": row["vlmCount"],
                "tp": row["tp"],
                "fp": row["fp"],
                "fn": row["fn"],
            }
    global_metrics = result["global"]
    return {
        "tp": global_metrics["tp"],
        "fp": global_metrics["fp"],
        "fn": global_metrics["fn"],
        "unmapped": unmapped_vlm,
        "gtCount": global_metrics["gtTotal"],
        "vlmCount": global_metrics["vlmTotal"],
        "f1": global_metrics["f1"],
        "meanIou": global_metrics["meanIou"],
        "classStats": class_stats,
    }


def finalize_merged_metrics(
    counters: dict[str, dict[str, float | int]],
    *,
    class_names: list[str],
    unmapped_vlm: int,
    gt_total: int,
    vlm_total: int,
) -> dict[str, Any]:
    """Build report payload from merged per-image counters."""
    total_tp = 0
    total_fp = 0
    total_fn = 0
    total_iou_sum = 0.0
    class_stats: list[dict[str, Any]] = []

    for cls in class_names:
        bucket = counters[cls]
        tp = int(bucket["tp"])
        fp = int(bucket["fp"])
        fn = int(bucket["fn"])
        iou_sum = float(bucket["iouSum"])
        precision = _ratio(tp, tp + fp)
        recall = _ratio(tp, tp + fn)

        total_tp += tp
        total_fp += fp
        total_fn += fn
        total_iou_sum += iou_sum

        class_stats.append(
            {
                "className": cls,
                "gtCount": int(bucket["gtCount"]),
                "vlmCount": int(bucket["vlmCount"]),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision": precision,
                "recall": recall,
                "f1": _f1(precision, recall),
                "meanIou": _ratio(iou_sum, tp),
            }
        )

    total_fp += unmapped_vlm
    precision = _ratio(total_tp, total_tp + total_fp)
    recall = _ratio(total_tp, total_tp + total_fn)

    return {
        "global": {
            "tp": total_tp,
            "fp": total_fp,
            "fn": total_fn,
            "gtTotal": gt_total,
            "vlmTotal": vlm_total,
            "unmappedVlm": unmapped_vlm,
            "precision": precision,
            "recall": recall,
            "f1": _f1(precision, recall),
            "meanIou": _ratio(total_iou_sum, total_tp),
        },
        "classStats": class_stats,
    }


def empty_metrics(class_names: list[str]) -> dict[str, Any]:
    return accumulate_metrics(
        gt_boxes=[],
        pred_boxes=[],
        unmapped_vlm=0,
        class_names=class_names,
        iou_threshold=0.5,
    )
