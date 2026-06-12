from __future__ import annotations

import json
import logging
import re
import shutil
import threading
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, Field

from ...core.config import settings
from ...schemas.common import APIResponse
from ...services.compare_metrics import (
    _empty_class_counters,
    apply_label_map_to_boxes,
    compute_image_metrics,
    finalize_merged_metrics,
    merge_image_metrics,
    parse_yolo_label_file,
)
from ...services.dataset_import.helpers import read_image_size
from ...services.locate_anything import detect as vlm_detect

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/compare", tags=["compare"])

# Cache lock to prevent concurrent writes to the same dataset cache file
cache_lock = threading.Lock()

# Lock to ensure only one VLM inference is run at a time (VLM is not thread-safe)
vlm_inference_lock = threading.Lock()

# Global dict to track background pre-computation tasks
# Key: dataset_name, Value: dict
precompute_tasks: dict[str, dict[str, Any]] = {}
precompute_lock = threading.Lock()


def get_yolo_datasets_dir() -> Path:
    """Return the absolute path to the yolo_datasets directory."""
    return settings.project_root.parent / "yolo_datasets"


def load_dataset_config(dataset_dir: Path) -> dict[str, Any]:
    """Parse data.yaml inside a dataset directory."""
    yaml_path = dataset_dir / "data.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"data.yaml not found in {dataset_dir}")

    with open(yaml_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Extract names mapping
    names = config.get("names", {})
    if isinstance(names, list):
        # Handle list format names: [Berry, Red Leaf]
        names_map = {i: name for i, name in enumerate(names)}
    elif isinstance(names, dict):
        # Handle dict format names: {0: Berry, 1: Red Leaf}
        names_map = {int(k): v for k, v in names.items()}
    else:
        names_map = {}

    config["names_map"] = names_map
    config["classes"] = [names_map.get(i, f"class_{i}") for i in sorted(names_map.keys())]
    return config


def load_vlm_cache(dataset_dir: Path) -> dict[str, Any]:
    """Load cached VLM predictions from vlm_cache.json."""
    cache_path = dataset_dir / "vlm_cache.json"
    if not cache_path.exists():
        return {}

    with cache_lock:
        try:
            with open(cache_path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Failed to load VLM cache: %s", e)
            return {}


def save_vlm_cache(dataset_dir: Path, cache: dict[str, Any]):
    """Save VLM predictions to vlm_cache.json."""
    cache_path = dataset_dir / "vlm_cache.json"
    with cache_lock:
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(cache, f, indent=2)
        except Exception as e:
            logger.error("Failed to save VLM cache: %s", e)


def vlm_cache_key(
    image_path: str,
    labels: list[str],
    default_labels: list[str],
    max_bbox_area: float = 1.0,
    min_confidence: float = 0.0,
) -> str:
    """Build a cache key; plain image_path when labels match dataset defaults."""
    base = image_path if labels == default_labels else f"{image_path}::{'|'.join(labels)}"
    suffixes: list[str] = []
    if max_bbox_area < 1.0:
        suffixes.append(f"max{round(max_bbox_area * 100)}")
    if min_confidence > 0.0:
        suffixes.append(f"conf{round(min_confidence * 100)}")
    if suffixes:
        return f"{base}::{'::'.join(suffixes)}"
    return base


def get_cached_vlm_boxes(
    vlm_cache: dict[str, Any],
    image_path: str,
    labels: list[str],
    default_labels: list[str],
    max_bbox_area: float = 1.0,
    min_confidence: float = 0.0,
) -> list[dict[str, Any]] | None:
    """Return cached VLM boxes for an image/label set, or None if not cached."""
    key = vlm_cache_key(image_path, labels, default_labels, max_bbox_area, min_confidence)
    if key not in vlm_cache:
        return None

    entry = vlm_cache[key]
    if isinstance(entry, list):
        return entry
    if isinstance(entry, dict):
        return entry.get("boxes")
    return None


def has_cached_vlm_prediction(
    vlm_cache: dict[str, Any],
    image_path: str,
    labels: list[str],
    default_labels: list[str],
    max_bbox_area: float = 1.0,
    min_confidence: float = 0.0,
) -> bool:
    return (
        get_cached_vlm_boxes(
            vlm_cache, image_path, labels, default_labels, max_bbox_area, min_confidence
        )
        is not None
    )


def save_vlm_cache_entry(
    dataset_dir: Path,
    vlm_cache: dict[str, Any],
    image_path: str,
    labels: list[str],
    default_labels: list[str],
    boxes: list[dict[str, Any]],
    max_bbox_area: float = 1.0,
    min_confidence: float = 0.0,
) -> None:
    key = vlm_cache_key(image_path, labels, default_labels, max_bbox_area, min_confidence)
    vlm_cache[key] = boxes
    save_vlm_cache(dataset_dir, vlm_cache)


def vlm_pred_to_absolute_boxes(
    pred_boxes: list[dict[str, Any]],
    orig_w: int,
    orig_h: int,
    img_w: int,
    img_h: int,
) -> list[dict[str, Any]]:
    vlm_boxes = []
    for box in pred_boxes:
        x1 = int(box["x1"] * orig_w / img_w)
        y1 = int(box["y1"] * orig_h / img_h)
        x2 = int(box["x2"] * orig_w / img_w)
        y2 = int(box["y2"] * orig_h / img_h)
        vlm_boxes.append(
            {
                "className": box["class_name"],
                "x1": max(0, x1),
                "y1": max(0, y1),
                "x2": min(orig_w, x2),
                "y2": min(orig_h, y2),
                "confidence": box.get("confidence"),
            }
        )
    return vlm_boxes


_OUTPUT_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def _validate_output_dataset_name(name: str) -> str:
    name = name.strip()
    if not name or not _OUTPUT_NAME_RE.match(name):
        raise HTTPException(
            400,
            detail="outputName must start with a letter or digit and contain only letters, digits, underscores, or hyphens",
        )
    return name


def _apply_label_map_to_boxes(
    boxes: list[dict[str, Any]],
    label_map: dict[str, str],
) -> list[dict[str, Any]]:
    if not label_map:
        return boxes
    mapped: list[dict[str, Any]] = []
    for box in boxes:
        gt_class = label_map.get(box.get("className", ""), "")
        if gt_class:
            mapped.append({**box, "className": gt_class})
    return mapped


def _resolve_export_class_names(
    label_map: dict[str, str],
    vlm_labels: list[str],
    source_classes: list[str],
) -> list[str]:
    if label_map and any(v for v in label_map.values() if v):
        return source_classes
    return vlm_labels if vlm_labels else source_classes


def _boxes_to_yolo_txt(
    boxes: list[dict[str, Any]],
    class_map: dict[str, int],
    img_w: int,
    img_h: int,
) -> str:
    if img_w <= 0 or img_h <= 0:
        return ""
    lines: list[str] = []
    for box in boxes:
        class_name = box.get("className", "")
        if class_name not in class_map:
            continue
        class_id = class_map[class_name]
        x_center = ((box["x1"] + box["x2"]) / 2) / img_w
        y_center = ((box["y1"] + box["y2"]) / 2) / img_h
        bw = (box["x2"] - box["x1"]) / img_w
        bh = (box["y2"] - box["y1"]) / img_h
        lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {bw:.6f} {bh:.6f}")
    return "\n".join(lines)


def _write_export_data_yaml(output_dir: Path, source_config: dict[str, Any], class_names: list[str]) -> None:
    names_block = "\n".join(f"  {i}: {name}" for i, name in enumerate(class_names))
    yaml_path = output_dir / "data.yaml"
    yaml_path.write_text(
        f"path: {output_dir.as_posix()}\n"
        f"train: {source_config.get('train', 'images/train')}\n"
        f"val: {source_config.get('val', 'images/val')}\n"
        f"test: {source_config.get('test', source_config.get('val', 'images/val'))}\n"
        f"names:\n{names_block}\n",
        encoding="utf-8",
    )
    (output_dir / "classes.txt").write_text(
        "\n".join(class_names) + ("\n" if class_names else ""),
        encoding="utf-8",
    )


def export_vlm_dataset_to_yolo(
    *,
    source_dir: Path,
    output_dir: Path,
    vlm_labels: list[str],
    default_classes: list[str],
    max_bbox_area: float,
    min_confidence: float,
    label_map: dict[str, str],
) -> dict[str, Any]:
    """Copy images and write YOLO labels from cached VLM predictions."""
    manifest_path = source_dir / "split_manifest.json"
    if not manifest_path.exists():
        raise HTTPException(400, detail="split_manifest.json not found in source dataset")

    with open(manifest_path, encoding="utf-8") as f:
        manifest: dict[str, str] = json.load(f)

    source_config = load_dataset_config(source_dir)
    export_classes = _resolve_export_class_names(label_map, vlm_labels, default_classes)
    class_map = {name: idx for idx, name in enumerate(export_classes)}

    vlm_cache = load_vlm_cache(source_dir)
    exported_images = 0
    skipped_uncached = 0
    total_boxes = 0

    for rel_key, split in manifest.items():
        img_rel_path = f"images/{split}/{rel_key}"
        src_img = source_dir / img_rel_path
        if not src_img.exists():
            continue

        cached_boxes = get_cached_vlm_boxes(
            vlm_cache,
            img_rel_path,
            vlm_labels,
            default_classes,
            max_bbox_area,
            min_confidence,
        )
        if cached_boxes is None:
            skipped_uncached += 1
            continue

        with Image.open(src_img) as img:
            img_w, img_h = img.size

        mapped_boxes = _apply_label_map_to_boxes(cached_boxes, label_map)
        label_stem = rel_key.rsplit(".", 1)[0]
        lbl_rel_path = f"labels/{split}/{label_stem}.txt"
        dst_img = output_dir / img_rel_path
        dst_lbl = output_dir / lbl_rel_path

        dst_img.parent.mkdir(parents=True, exist_ok=True)
        dst_lbl.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_img, dst_img)

        label_txt = _boxes_to_yolo_txt(mapped_boxes, class_map, img_w, img_h)
        dst_lbl.write_text(label_txt + ("\n" if label_txt else ""), encoding="utf-8")

        exported_images += 1
        total_boxes += len(mapped_boxes)

    if exported_images == 0:
        if skipped_uncached > 0:
            raise HTTPException(
                400,
                detail="No cached VLM predictions found for the current labels and constraints",
            )
        raise HTTPException(400, detail="No images found to export")

    shutil.copy2(manifest_path, output_dir / "split_manifest.json")
    _write_export_data_yaml(output_dir, source_config, export_classes)

    return {
        "outputPath": str(output_dir),
        "outputName": output_dir.name,
        "exportedImages": exported_images,
        "skippedUncached": skipped_uncached,
        "totalBoxes": total_boxes,
        "classes": export_classes,
    }


def delete_vlm_cache_file(dataset_dir: Path) -> int:
    """Delete vlm_cache.json and return the number of entries that were cached."""
    cache_path = dataset_dir / "vlm_cache.json"
    if not cache_path.exists():
        return 0

    with cache_lock:
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
            count = len(cache) if isinstance(cache, dict) else 0
        except Exception as e:
            logger.warning("Failed to read VLM cache before delete: %s", e)
            count = 0
        cache_path.unlink(missing_ok=True)
    return count


@router.get("/datasets")
def list_datasets() -> APIResponse:
    """List all available datasets in yolo_datasets directory."""
    datasets_dir = get_yolo_datasets_dir()
    if not datasets_dir.exists():
        return APIResponse(data=[])

    results = []
    for item in datasets_dir.iterdir():
        if item.is_dir() and (item / "data.yaml").exists():
            try:
                config = load_dataset_config(item)

                # Check for manifest
                manifest_path = item / "split_manifest.json"
                manifest_exists = manifest_path.exists()

                image_count = 0
                train_count = 0
                test_count = 0

                if manifest_exists:
                    try:
                        with open(manifest_path) as f:
                            manifest = json.load(f)
                            image_count = len(manifest)
                            train_count = sum(1 for v in manifest.values() if v == "train")
                            test_count = sum(1 for v in manifest.values() if v == "test")
                    except Exception as e:
                        logger.warning("Failed to read split manifest for %s: %s", item.name, e)

                results.append(
                    {
                        "name": item.name,
                        "classes": config.get("classes", []),
                        "hasManifest": manifest_exists,
                        "imageCount": image_count,
                        "trainCount": train_count,
                        "testCount": test_count,
                    }
                )
            except Exception as e:
                logger.warning("Error reading dataset %s: %s", item.name, e)

    return APIResponse(data=results)


@router.get("/datasets/{dataset_name}/images")
def get_dataset_images(
    dataset_name: str,
    vlm_labels: list[str] | None = Query(None, alias="vlmLabels"),
    max_bbox_area: float = Query(1.0, alias="maxBBoxArea", ge=0.01, le=1.0),
    min_confidence: float = Query(0.0, alias="minConfidence", ge=0.0, le=1.0),
) -> APIResponse:
    """Get the list of images, classes, splits, and VLM cache status for a dataset."""
    datasets_dir = get_yolo_datasets_dir()
    dataset_dir = datasets_dir / dataset_name
    if not dataset_dir.exists():
        raise HTTPException(404, detail=f"Dataset {dataset_name} not found")

    try:
        config = load_dataset_config(dataset_dir)
        classes = config.get("classes", [])
        active_vlm_labels = vlm_labels if vlm_labels else classes

        manifest_path = dataset_dir / "split_manifest.json"
        manifest = {}
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = json.load(f)

        vlm_cache = load_vlm_cache(dataset_dir)

        images_list = []
        for rel_key, split in manifest.items():
            img_rel_path = f"images/{split}/{rel_key}"
            lbl_rel_path = f"labels/{split}/{rel_key.rsplit('.', 1)[0]}.txt"

            # Verify if image exists
            if (dataset_dir / img_rel_path).exists():
                images_list.append(
                    {
                        "key": rel_key,
                        "split": split,
                        "imagePath": img_rel_path,
                        "labelPath": lbl_rel_path,
                        "hasVlmPrediction": has_cached_vlm_prediction(
                            vlm_cache,
                            img_rel_path,
                            active_vlm_labels,
                            classes,
                            max_bbox_area,
                            min_confidence,
                        ),
                    }
                )

        # Sort images by split and then key
        images_list.sort(key=lambda x: (x["split"], x["key"]))

        # Calculate caching progress
        total_images = len(images_list)
        cached_images = sum(1 for img in images_list if img["hasVlmPrediction"])

        # Get background precompute task status if any
        with precompute_lock:
            task = precompute_tasks.get(dataset_name)
            if task:
                task_status = {
                    "status": task["status"],
                    "current": task["current"],
                    "total": task["total"],
                    "currentImage": task["current_image"],
                    "error": task["error"],
                }
            else:
                task_status = {
                    "status": "idle",
                    "current": 0,
                    "total": 0,
                    "currentImage": "",
                    "error": "",
                }

        progress_pct = int(cached_images / total_images * 100) if total_images > 0 else 0
        return APIResponse(
            data={
                "classes": classes,
                "vlmLabels": active_vlm_labels,
                "images": images_list,
                "stats": {
                    "total": total_images,
                    "cached": cached_images,
                    "progressPercent": progress_pct,
                },
                "precomputeTask": task_status,
            }
        )
    except Exception as e:
        logger.exception("Failed to get dataset images")
        raise HTTPException(500, detail=str(e)) from e


@router.get("/image")
def get_image(dataset: str, image_path: str = Query(..., alias="imagePath")):
    """Retrieve an image file directly from the dataset directory."""
    datasets_dir = get_yolo_datasets_dir()
    file_path = datasets_dir / dataset / image_path
    if not file_path.exists():
        raise HTTPException(404, detail="Image not found")
    return FileResponse(str(file_path))


@router.get("/annotations")
def get_annotations(
    dataset: str,
    image_path: str = Query(..., alias="imagePath"),
    label_path: str = Query(..., alias="labelPath"),
    run_vlm: bool = Query(False, alias="runVLM"),
    vlm_labels: list[str] | None = Query(None, alias="vlmLabels"),
    max_bbox_area: float = Query(1.0, alias="maxBBoxArea", ge=0.01, le=1.0),
    min_confidence: float = Query(0.0, alias="minConfidence", ge=0.0, le=1.0),
) -> APIResponse:
    """Retrieve ground truth (human) annotations and VLM annotations (cached or run on the fly)."""
    datasets_dir = get_yolo_datasets_dir()
    dataset_dir = datasets_dir / dataset

    img_full_path = dataset_dir / image_path
    lbl_full_path = dataset_dir / label_path

    if not img_full_path.exists():
        raise HTTPException(404, detail="Image not found")

    try:
        # Load dataset config to get classes map
        config = load_dataset_config(dataset_dir)
        names_map = config.get("names_map", {})
        classes = config.get("classes", [])
        active_vlm_labels = vlm_labels if vlm_labels else classes

        if run_vlm and not active_vlm_labels:
            raise HTTPException(400, detail="At least one VLM label is required")

        # Open image to get dimensions
        with Image.open(img_full_path) as img:
            orig_w, orig_h = img.size

        # 1. Parse human annotations (Ground Truth)
        human_boxes = []
        if lbl_full_path.exists():
            with open(lbl_full_path, encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        try:
                            class_id = int(parts[0])
                            x_c = float(parts[1])
                            y_c = float(parts[2])
                            w = float(parts[3])
                            h = float(parts[4])

                            # Convert YOLO format normalized to absolute pixels
                            x1 = int((x_c - w / 2) * orig_w)
                            y1 = int((y_c - h / 2) * orig_h)
                            x2 = int((x_c + w / 2) * orig_w)
                            y2 = int((y_c + h / 2) * orig_h)

                            class_name = names_map.get(class_id, f"class_{class_id}")

                            human_boxes.append(
                                {
                                    "className": class_name,
                                    "x1": max(0, x1),
                                    "y1": max(0, y1),
                                    "x2": min(orig_w, x2),
                                    "y2": min(orig_h, y2),
                                }
                            )
                        except Exception as val_err:
                            logger.warning(
                                "Skipping malformed annotation line in %s: %s", label_path, val_err
                            )

        # 2. Get VLM annotations (cached or on the fly)
        vlm_cache = load_vlm_cache(dataset_dir)
        vlm_boxes = []
        vlm_cached = False

        cached_boxes = get_cached_vlm_boxes(
            vlm_cache,
            image_path,
            active_vlm_labels,
            classes,
            max_bbox_area,
            min_confidence,
        )
        if cached_boxes is not None:
            vlm_boxes = cached_boxes
            vlm_cached = True
        elif run_vlm:
            # Run inference with lock to prevent concurrent runs
            with vlm_inference_lock:
                try:
                    result = vlm_detect(
                        img_full_path,
                        active_vlm_labels,
                        max_bbox_area_ratio=max_bbox_area,
                        min_confidence=min_confidence,
                    )
                    pred_boxes = result.get("boxes", [])
                    img_w = result.get("img_w", orig_w)
                    img_h = result.get("img_h", orig_h)

                    vlm_boxes = vlm_pred_to_absolute_boxes(pred_boxes, orig_w, orig_h, img_w, img_h)

                    save_vlm_cache_entry(
                        dataset_dir,
                        vlm_cache,
                        image_path,
                        active_vlm_labels,
                        classes,
                        vlm_boxes,
                        max_bbox_area,
                        min_confidence,
                    )

                except Exception as e:
                    logger.exception("VLM prediction failed for %s", image_path)
                    raise HTTPException(500, detail=f"VLM prediction failed: {e}") from e

        return APIResponse(
            data={
                "humanBoxes": human_boxes,
                "vlmBoxes": vlm_boxes,
                "vlmCached": vlm_cached,
                "vlmLabels": active_vlm_labels,
                "maxBBoxArea": max_bbox_area,
                "minConfidence": min_confidence,
                "dimensions": {"width": orig_w, "height": orig_h},
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to retrieve annotations")
        raise HTTPException(500, detail=str(e)) from e


# ── Background Pre-computation Tasks ──────────────────────────


class PrecomputeRequest(BaseModel):
    vlm_labels: list[str] = Field(default_factory=list, alias="vlmLabels")
    max_bbox_area: float = Field(1.0, alias="maxBBoxArea", ge=0.01, le=1.0)
    min_confidence: float = Field(0.0, alias="minConfidence", ge=0.0, le=1.0)

    model_config = {"populate_by_name": True}


class ExportVlmDatasetRequest(BaseModel):
    output_name: str = Field(..., alias="outputName")
    vlm_labels: list[str] = Field(default_factory=list, alias="vlmLabels")
    max_bbox_area: float = Field(1.0, alias="maxBBoxArea", ge=0.01, le=1.0)
    min_confidence: float = Field(0.0, alias="minConfidence", ge=0.0, le=1.0)
    label_map: dict[str, str] = Field(default_factory=dict, alias="labelMap")

    model_config = {"populate_by_name": True}


def run_precompute_background(
    dataset_name: str,
    dataset_dir: Path,
    image_paths: list[str],
    label_paths: list[str],
    default_classes: list[str],
    active_vlm_labels: list[str],
    max_bbox_area: float = 1.0,
    min_confidence: float = 0.0,
):
    """Background worker that sequentially runs VLM on all images in a dataset."""
    global precompute_tasks

    logger.info("Starting background VLM precompute task for dataset: %s", dataset_name)
    vlm_cache = load_vlm_cache(dataset_dir)

    # Filter out images already in cache
    pending = []
    for img_path, lbl_path in zip(image_paths, label_paths, strict=True):
        if not has_cached_vlm_prediction(
            vlm_cache,
            img_path,
            active_vlm_labels,
            default_classes,
            max_bbox_area,
            min_confidence,
        ):
            pending.append((img_path, lbl_path))

    total_pending = len(pending)
    logger.info("Found %d pending images to precompute", total_pending)

    if total_pending == 0:
        with precompute_lock:
            precompute_tasks[dataset_name]["status"] = "completed"
            precompute_tasks[dataset_name]["current_image"] = "All images already cached."
        return

    try:
        for idx, (img_path, _) in enumerate(pending):
            # Check for cancellation
            with precompute_lock:
                if precompute_tasks.get(dataset_name, {}).get("status") == "cancelled":
                    logger.info("Precompute task cancelled for %s", dataset_name)
                    return
                precompute_tasks[dataset_name]["current"] = idx + 1
                precompute_tasks[dataset_name]["current_image"] = Path(img_path).name

            img_full_path = dataset_dir / img_path

            # Verify image exists
            if not img_full_path.exists():
                continue

            # Get original size
            try:
                with Image.open(img_full_path) as img:
                    orig_w, orig_h = img.size
            except Exception:
                continue

            # Run VLM prediction
            vlm_boxes = []
            with vlm_inference_lock:
                # Check for cancellation again
                with precompute_lock:
                    if precompute_tasks.get(dataset_name, {}).get("status") == "cancelled":
                        return

                try:
                    result = vlm_detect(
                        img_full_path,
                        active_vlm_labels,
                        max_bbox_area_ratio=max_bbox_area,
                        min_confidence=min_confidence,
                    )
                    pred_boxes = result.get("boxes", [])
                    img_w = result.get("img_w", orig_w)
                    img_h = result.get("img_h", orig_h)

                    vlm_boxes = vlm_pred_to_absolute_boxes(pred_boxes, orig_w, orig_h, img_w, img_h)
                except Exception as e:
                    logger.error("VLM precompute failed for %s: %s", img_path, e)
                    # Don't fail the whole task, just continue
                    continue

            vlm_cache = load_vlm_cache(dataset_dir)
            save_vlm_cache_entry(
                dataset_dir,
                vlm_cache,
                img_path,
                active_vlm_labels,
                default_classes,
                vlm_boxes,
                max_bbox_area,
                min_confidence,
            )

        with precompute_lock:
            status_msg = f"Finished precomputing {total_pending} images."
            precompute_tasks[dataset_name]["status"] = "completed"
            precompute_tasks[dataset_name]["current_image"] = status_msg

    except Exception as e:
        logger.exception("Precompute task crashed")
        with precompute_lock:
            precompute_tasks[dataset_name]["status"] = "failed"
            precompute_tasks[dataset_name]["error"] = str(e)


@router.post("/datasets/{dataset_name}/precompute")
def start_precompute(
    dataset_name: str,
    background_tasks: BackgroundTasks,
    body: PrecomputeRequest | None = Body(None),
) -> APIResponse:
    """Start background VLM pre-computation for all images in the dataset."""
    global precompute_tasks

    datasets_dir = get_yolo_datasets_dir()
    dataset_dir = datasets_dir / dataset_name
    if not dataset_dir.exists():
        raise HTTPException(404, detail=f"Dataset {dataset_name} not found")

    with precompute_lock:
        task = precompute_tasks.get(dataset_name)
        if task and task["status"] == "running":
            return APIResponse(
                data={"message": "Precompute task already running", "status": "running"}
            )

        try:
            config = load_dataset_config(dataset_dir)
            classes = config.get("classes", [])
            active_vlm_labels = body.vlm_labels if body and body.vlm_labels else classes
            max_bbox_area = body.max_bbox_area if body else 1.0
            min_confidence = body.min_confidence if body else 0.0
            if not active_vlm_labels:
                raise HTTPException(400, detail="At least one VLM label is required")

            manifest_path = dataset_dir / "split_manifest.json"
            manifest = {}
            if manifest_path.exists():
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)

            vlm_cache = load_vlm_cache(dataset_dir)

            image_paths = []
            label_paths = []

            for rel_key, split in manifest.items():
                img_rel_path = f"images/{split}/{rel_key}"
                lbl_rel_path = f"labels/{split}/{rel_key.rsplit('.', 1)[0]}.txt"
                if (dataset_dir / img_rel_path).exists() and not has_cached_vlm_prediction(
                    vlm_cache,
                    img_rel_path,
                    active_vlm_labels,
                    classes,
                    max_bbox_area,
                    min_confidence,
                ):
                    image_paths.append(img_rel_path)
                    label_paths.append(lbl_rel_path)

            total_pending = len(image_paths)

            # Setup task state
            precompute_tasks[dataset_name] = {
                "status": "running",
                "current": 0,
                "total": total_pending,
                "current_image": "Initializing...",
                "error": "",
            }

            if total_pending > 0:
                background_tasks.add_task(
                    run_precompute_background,
                    dataset_name,
                    dataset_dir,
                    image_paths,
                    label_paths,
                    classes,
                    active_vlm_labels,
                    max_bbox_area,
                    min_confidence,
                )
            else:
                precompute_tasks[dataset_name]["status"] = "completed"
                precompute_tasks[dataset_name]["current_image"] = "All images already cached."

            return APIResponse(
                data={
                    "message": "Precompute task started",
                    "status": "running",
                    "total": total_pending,
                }
            )

        except Exception as e:
            logger.exception("Failed to start precompute task")
            raise HTTPException(500, detail=str(e)) from e


@router.post("/datasets/{dataset_name}/precompute/cancel")
def cancel_precompute(dataset_name: str) -> APIResponse:
    """Cancel a running precompute task."""
    global precompute_tasks

    with precompute_lock:
        task = precompute_tasks.get(dataset_name)
        if not task:
            raise HTTPException(404, detail="No precompute task found for this dataset")

        if task["status"] == "running":
            task["status"] = "cancelled"
            task["current_image"] = "Cancelling..."
            return APIResponse(data={"message": "Cancellation request sent", "status": "cancelled"})

        return APIResponse(data={"message": "Task is not running", "status": task["status"]})


@router.post("/datasets/{dataset_name}/cache/clear")
def clear_vlm_cache(dataset_name: str) -> APIResponse:
    """Delete all cached VLM predictions for a dataset."""
    datasets_dir = get_yolo_datasets_dir()
    dataset_dir = datasets_dir / dataset_name
    if not dataset_dir.exists():
        raise HTTPException(404, detail=f"Dataset {dataset_name} not found")

    with precompute_lock:
        task = precompute_tasks.get(dataset_name)
        if task and task["status"] == "running":
            raise HTTPException(
                409,
                detail="Cannot clear cache while a precompute task is running",
            )

    cleared = delete_vlm_cache_file(dataset_dir)
    return APIResponse(
        data={
            "message": "VLM cache cleared",
            "cleared": cleared,
        }
    )


@router.post("/datasets/{dataset_name}/export")
def export_vlm_dataset(
    dataset_name: str,
    body: ExportVlmDatasetRequest,
) -> APIResponse:
    """Export cached VLM predictions as a new YOLO dataset (images + labels + data.yaml)."""
    datasets_dir = get_yolo_datasets_dir()
    source_dir = datasets_dir / dataset_name
    if not source_dir.exists():
        raise HTTPException(404, detail=f"Dataset {dataset_name} not found")

    with precompute_lock:
        task = precompute_tasks.get(dataset_name)
        if task and task["status"] == "running":
            raise HTTPException(
                409,
                detail="Cannot export while a precompute task is running",
            )

    output_name = _validate_output_dataset_name(body.output_name)
    output_dir = datasets_dir / output_name
    if output_dir.exists():
        raise HTTPException(
            409,
            detail=f"Dataset {output_name} already exists; choose a different outputName",
        )

    try:
        config = load_dataset_config(source_dir)
        default_classes = config.get("classes", [])
        active_vlm_labels = body.vlm_labels if body.vlm_labels else default_classes

        result = export_vlm_dataset_to_yolo(
            source_dir=source_dir,
            output_dir=output_dir,
            vlm_labels=active_vlm_labels,
            default_classes=default_classes,
            max_bbox_area=body.max_bbox_area,
            min_confidence=body.min_confidence,
            label_map=body.label_map,
        )
        return APIResponse(
            data={
                "message": "VLM dataset exported",
                **result,
            }
        )
    except HTTPException:
        if output_dir.exists():
            shutil.rmtree(output_dir, ignore_errors=True)
        raise
    except Exception as e:
        if output_dir.exists():
            shutil.rmtree(output_dir, ignore_errors=True)
        logger.exception("Failed to export VLM dataset")
        raise HTTPException(500, detail=str(e)) from e


@router.get("/datasets/{dataset_name}/report")
def get_dataset_report(
    dataset_name: str,
    iou_threshold: float = Query(0.5, alias="iouThreshold", ge=0.1, le=0.95),
    vlm_labels: list[str] | None = Query(None, alias="vlmLabels"),
    max_bbox_area: float = Query(1.0, alias="maxBBoxArea", ge=0.01, le=1.0),
    min_confidence: float = Query(0.0, alias="minConfidence", ge=0.0, le=1.0),
    label_map_json: str | None = Query(None, alias="labelMap"),
) -> APIResponse:
    """Aggregate VLM vs ground-truth metrics across all cached images in a dataset."""
    datasets_dir = get_yolo_datasets_dir()
    dataset_dir = datasets_dir / dataset_name
    if not dataset_dir.exists():
        raise HTTPException(404, detail=f"Dataset {dataset_name} not found")

    label_map: dict[str, str] = {}
    if label_map_json:
        try:
            parsed = json.loads(label_map_json)
            if isinstance(parsed, dict):
                label_map = {str(k): str(v) for k, v in parsed.items() if v}
        except json.JSONDecodeError as e:
            raise HTTPException(400, detail="labelMap must be valid JSON") from e

    try:
        config = load_dataset_config(dataset_dir)
        classes = config.get("classes", [])
        names_map = config.get("names_map", {})
        active_vlm_labels = vlm_labels if vlm_labels else classes

        manifest_path = dataset_dir / "split_manifest.json"
        if not manifest_path.exists():
            raise HTTPException(400, detail="split_manifest.json not found")

        with open(manifest_path, encoding="utf-8") as f:
            manifest: dict[str, str] = json.load(f)

        vlm_cache = load_vlm_cache(dataset_dir)

        overall_counters = _empty_class_counters(classes)
        split_counters: dict[str, dict[str, dict[str, float | int]]] = {}
        split_unmapped: dict[str, int] = {}
        split_gt_total: dict[str, int] = {}
        split_vlm_total: dict[str, int] = {}
        split_images: dict[str, int] = {}

        images_evaluated = 0
        images_skipped = 0
        gt_box_total = 0
        vlm_box_total = 0
        unmapped_vlm_total = 0
        gt_boxes_per_image: list[float] = []
        vlm_boxes_per_image: list[float] = []
        image_stats: list[dict[str, Any]] = []

        for rel_key, split in manifest.items():
            img_rel_path = f"images/{split}/{rel_key}"
            lbl_rel_path = f"labels/{split}/{rel_key.rsplit('.', 1)[0]}.txt"
            img_full_path = dataset_dir / img_rel_path
            lbl_full_path = dataset_dir / lbl_rel_path

            if not img_full_path.exists():
                continue

            cached_boxes = get_cached_vlm_boxes(
                vlm_cache,
                img_rel_path,
                active_vlm_labels,
                classes,
                max_bbox_area,
                min_confidence,
            )
            if cached_boxes is None:
                images_skipped += 1
                continue

            img_w, img_h = read_image_size(str(img_full_path))
            if img_w <= 0 or img_h <= 0:
                images_skipped += 1
                continue

            human_boxes = parse_yolo_label_file(lbl_full_path, names_map, img_w, img_h)
            mapped_vlm, unmapped = apply_label_map_to_boxes(cached_boxes, label_map)

            merge_image_metrics(
                overall_counters,
                gt_boxes=human_boxes,
                pred_boxes=mapped_vlm,
                class_names=classes,
                iou_threshold=iou_threshold,
            )

            if split not in split_counters:
                split_counters[split] = _empty_class_counters(classes)
                split_unmapped[split] = 0
                split_gt_total[split] = 0
                split_vlm_total[split] = 0
                split_images[split] = 0

            merge_image_metrics(
                split_counters[split],
                gt_boxes=human_boxes,
                pred_boxes=mapped_vlm,
                class_names=classes,
                iou_threshold=iou_threshold,
            )
            split_unmapped[split] += unmapped
            split_gt_total[split] += len(human_boxes)
            split_vlm_total[split] += len(cached_boxes)
            split_images[split] += 1

            images_evaluated += 1
            gt_box_total += len(human_boxes)
            vlm_box_total += len(cached_boxes)
            unmapped_vlm_total += unmapped
            gt_boxes_per_image.append(len(human_boxes))
            vlm_boxes_per_image.append(len(cached_boxes))

            img_metrics = compute_image_metrics(
                gt_boxes=human_boxes,
                pred_boxes=mapped_vlm,
                unmapped_vlm=unmapped,
                class_names=classes,
                iou_threshold=iou_threshold,
            )
            image_stats.append(
                {
                    "key": rel_key,
                    "split": split,
                    "imagePath": img_rel_path,
                    "labelPath": lbl_rel_path,
                    **img_metrics,
                }
            )

        if images_evaluated == 0:
            raise HTTPException(
                400,
                detail="No cached VLM predictions found for the current labels and constraints",
            )

        overall = finalize_merged_metrics(
            overall_counters,
            class_names=classes,
            unmapped_vlm=unmapped_vlm_total,
            gt_total=gt_box_total,
            vlm_total=vlm_box_total,
        )

        split_stats = []
        for split in sorted(split_counters.keys()):
            metrics = finalize_merged_metrics(
                split_counters[split],
                class_names=classes,
                unmapped_vlm=split_unmapped[split],
                gt_total=split_gt_total[split],
                vlm_total=split_vlm_total[split],
            )
            split_stats.append(
                {
                    "split": split,
                    "images": split_images[split],
                    **metrics["global"],
                }
            )

        def _avg(values: list[float]) -> float:
            return sum(values) / len(values) if values else 0.0

        return APIResponse(
            data={
                "dataset": dataset_name,
                "vlmLabels": active_vlm_labels,
                "maxBBoxArea": max_bbox_area,
                "minConfidence": min_confidence,
                "iouThreshold": iou_threshold,
                "labelMap": label_map,
                "imagesEvaluated": images_evaluated,
                "imagesSkipped": images_skipped,
                "imagesTotal": images_evaluated + images_skipped,
                "gtBoxTotal": gt_box_total,
                "vlmBoxTotal": vlm_box_total,
                "unmappedVlmTotal": unmapped_vlm_total,
                "avgGtBoxesPerImage": _avg(gt_boxes_per_image),
                "avgVlmBoxesPerImage": _avg(vlm_boxes_per_image),
                "overall": overall,
                "splitStats": split_stats,
                "imageStats": image_stats,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to generate dataset report")
        raise HTTPException(500, detail=str(e)) from e
