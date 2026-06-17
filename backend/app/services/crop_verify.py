"""Shared crop-based box verification utilities."""

from __future__ import annotations

import logging
import re

from PIL import Image

logger = logging.getLogger(__name__)

_YES_NO_PATTERN = re.compile(r"\b(yes|no)\b", re.IGNORECASE)


def parse_verification_answer(raw_text: str) -> bool:
    """Return True to keep the box; False to reject it.

    Uses the last yes/no token in the response. Ambiguous answers are kept.
    """
    matches = _YES_NO_PATTERN.findall(raw_text or "")
    if not matches:
        return True
    return matches[-1].lower() == "yes"


def crop_box_image(
    img: Image.Image,
    box: dict,
    padding_ratio: float = 0.1,
    min_size: int = 32,
) -> Image.Image:
    """Crop a padded region around a box, clamped to image bounds."""
    img_w, img_h = img.size
    x1, y1, x2, y2 = box["x1"], box["y1"], box["x2"], box["y2"]
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    pad_x = int(bw * padding_ratio)
    pad_y = int(bh * padding_ratio)
    cx1 = max(0, x1 - pad_x)
    cy1 = max(0, y1 - pad_y)
    cx2 = min(img_w, x2 + pad_x)
    cy2 = min(img_h, y2 + pad_y)

    if cx2 - cx1 < min_size:
        extra = (min_size - (cx2 - cx1) + 1) // 2
        cx1 = max(0, cx1 - extra)
        cx2 = min(img_w, cx2 + extra)
    if cy2 - cy1 < min_size:
        extra = (min_size - (cy2 - cy1) + 1) // 2
        cy1 = max(0, cy1 - extra)
        cy2 = min(img_h, cy2 + extra)

    return img.crop((cx1, cy1, cx2, cy2))


class CropVerifier:
    """Protocol for yes/no crop verification."""

    def verify_crop(self, image: Image.Image, class_name: str) -> bool:
        raise NotImplementedError


def filter_boxes_by_crop_verification(
    verifier: CropVerifier,
    img: Image.Image,
    boxes: list[dict],
    padding_ratio: float = 0.1,
) -> list[dict]:
    """Second-pass VLM check: crop each box and ask yes/no to drop false positives."""
    if not boxes:
        return boxes

    kept: list[dict] = []
    for box in boxes:
        class_name = (box.get("class_name") or "").strip()
        if not class_name:
            kept.append(box)
            continue
        crop = crop_box_image(img, box, padding_ratio=padding_ratio)
        try:
            if verifier.verify_crop(crop, class_name):
                kept.append(box)
            else:
                logger.info("Crop verification rejected %s box", class_name)
        except Exception:
            logger.exception("Crop verification failed for %s; keeping box", class_name)
            kept.append(box)
        finally:
            crop.close()

    return kept
