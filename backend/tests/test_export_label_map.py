from __future__ import annotations

from app.services.export import _build_class_map
from app.services.yolo_format import detection_to_yolo


class DummyBox:
    def __init__(self, x1, y1, x2, y2, class_name):
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2
        self.class_name = class_name


class DummyDetection:
    def __init__(self, boxes, image_width, image_height, filter_mode=None, filter_nms_iou=None):
        self.boxes = boxes
        self.image_width = image_width
        self.image_height = image_height
        self.filter_mode = filter_mode
        self.filter_nms_iou = filter_nms_iou


def test_export_label_map_renames_classes():
    det = DummyDetection([DummyBox(100, 100, 300, 300, "red berry")], 1000, 1000)
    label_map = {"red berry": "berry"}
    class_map = _build_class_map([det], label_map)
    assert class_map == {"berry": 0}
    yolo = detection_to_yolo(det, class_map, label_map)
    assert yolo.startswith("0 ")
