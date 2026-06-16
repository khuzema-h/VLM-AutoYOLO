import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CANVAS_MAX_W, CANVAS_MAX_H, CANVAS_MIN_BOX_SIZE, BOX_COLORS } from "@/lib/constants";
import {
  clampBox,
  hitTestBox,
  hitTestHandle,
  resizeBox,
  type ResizeHandle,
} from "@/lib/bboxHitTest";
import type { BBox } from "@/types";

type EditorMode = "select" | "draw";

interface Props {
  imageUrl: string;
  boxes: BBox[];
  imgWidth: number;
  imgHeight: number;
  mode: EditorMode;
  selectedBoxId: string | null;
  hiddenIndices: Set<string>;
  onModeChange: (mode: EditorMode) => void;
  onSelectBox: (boxId: string | null) => void;
  onUpdateBox: (boxId: string, coords: { x1: number; y1: number; x2: number; y2: number }) => void;
  onDrawBox: (box: { x1: number; y1: number; x2: number; y2: number }) => void;
}

type DragState =
  | {
      kind: "move";
      boxId: string;
      startX: number;
      startY: number;
      orig: BBox;
    }
  | {
      kind: "resize";
      boxId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      orig: BBox;
    }
  | {
      kind: "draw";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

export function BBoxEditorCanvas({
  imageUrl,
  boxes,
  imgWidth,
  imgHeight,
  mode,
  selectedBoxId,
  hiddenIndices,
  onModeChange,
  onSelectBox,
  onUpdateBox,
  onDrawBox,
}: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewBox, setPreviewBox] = useState<BBox | null>(null);
  const [showBBox, setShowBBox] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const loadIdRef = useRef(0);

  useEffect(() => {
    if (imgWidth > 0 && imgHeight > 0) return;
    let active = true;
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      if (active) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    return () => {
      active = false;
    };
  }, [imageUrl, imgWidth, imgHeight]);

  const actualW = imgWidth > 0 ? imgWidth : naturalSize.w;
  const actualH = imgHeight > 0 ? imgHeight : naturalSize.h;
  const scale =
    actualW > 0 && actualH > 0 ? Math.min(CANVAS_MAX_W / actualW, CANVAS_MAX_H / actualH, 1) : 1;

  const displayBoxes = useMemo(() => {
    if (!previewBox) return boxes;
    return boxes.map((b) => (b.id === previewBox.id ? previewBox : b));
  }, [boxes, previewBox]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || actualW === 0 || actualH === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const displayW = Math.round(actualW * scale);
    const displayH = Math.round(actualH * scale);
    if (canvas.width !== displayW) canvas.width = displayW;
    if (canvas.height !== displayH) canvas.height = displayH;

    const loadId = ++loadIdRef.current;
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      if (loadId !== loadIdRef.current) return;
      ctx.clearRect(0, 0, displayW, displayH);
      ctx.drawImage(img, 0, 0, displayW, displayH);

      const uniqClasses = [...new Set(displayBoxes.map((b) => b.className))];
      const classColorMap = new Map<string, string>();
      uniqClasses.forEach((c, i) => classColorMap.set(c, BOX_COLORS[i % BOX_COLORS.length]));

      displayBoxes.forEach((box) => {
        if (hiddenIndices.has(box.id)) return;
        const baseColor = classColorMap.get(box.className) ?? BOX_COLORS[0];
        const color = confidenceColor(box.confidence, baseColor);
        const selected = box.id === selectedBoxId;
        if (showMask && box.maskPolygon && box.maskPolygon.length >= 3) {
          drawPolygon(ctx, box.maskPolygon, scale, color);
        }
        if (showBBox) {
          drawRect(
            ctx,
            box.x1 * scale,
            box.y1 * scale,
            (box.x2 - box.x1) * scale,
            (box.y2 - box.y1) * scale,
            selected ? "#2563EB" : color,
            box.className,
            selected ? 3 : 2,
          );
          if (selected && mode === "select") {
            drawHandles(ctx, box, scale);
          }
        }
      });

      if (drag?.kind === "draw") {
        const x = Math.min(drag.startX, drag.currentX);
        const y = Math.min(drag.startY, drag.currentY);
        const w = Math.abs(drag.currentX - drag.startX);
        const h = Math.abs(drag.currentY - drag.startY);
        drawRect(ctx, x, y, w, h, "#FF9800", "", 2);
      }
    };
  }, [
    imageUrl,
    displayBoxes,
    scale,
    drag,
    hiddenIndices,
    actualW,
    actualH,
    showBBox,
    showMask,
    selectedBoxId,
    mode,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);

    if (mode === "draw") {
      setDrag({ kind: "draw", startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    const selected = selectedBoxId ? boxes.find((b) => b.id === selectedBoxId) : null;
    if (selected && !hiddenIndices.has(selected.id)) {
      const handle = hitTestHandle(selected, x, y, scale);
      if (handle) {
        setDrag({
          kind: "resize",
          boxId: selected.id,
          handle,
          startX: x,
          startY: y,
          orig: selected,
        });
        setPreviewBox({ ...selected });
        return;
      }
      const hit = hitTestBox([selected], x, y, scale, new Set());
      if (hit) {
        setDrag({
          kind: "move",
          boxId: selected.id,
          startX: x,
          startY: y,
          orig: selected,
        });
        setPreviewBox({ ...selected });
        return;
      }
    }

    const hit = hitTestBox(boxes, x, y, scale, hiddenIndices);
    if (hit) {
      onSelectBox(hit.id);
      setDrag({
        kind: "move",
        boxId: hit.id,
        startX: x,
        startY: y,
        orig: hit,
      });
      setPreviewBox({ ...hit });
      return;
    }

    onSelectBox(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getPos(e);

    if (drag.kind === "draw") {
      setDrag({ ...drag, currentX: x, currentY: y });
      return;
    }

    const dx = Math.round((x - drag.startX) / scale);
    const dy = Math.round((y - drag.startY) / scale);

    if (drag.kind === "move") {
      const moved = clampBox(
        {
          x1: drag.orig.x1 + dx,
          y1: drag.orig.y1 + dy,
          x2: drag.orig.x2 + dx,
          y2: drag.orig.y2 + dy,
        },
        actualW,
        actualH,
      );
      setPreviewBox({ ...drag.orig, ...moved });
      return;
    }

    const resized = clampBox(resizeBox(drag.orig, drag.handle, dx, dy), actualW, actualH);
    setPreviewBox({ ...drag.orig, ...resized });
  };

  const onMouseUp = () => {
    if (!drag) return;

    if (drag.kind === "draw") {
      const x1 = Math.round(Math.min(drag.startX, drag.currentX) / scale);
      const y1 = Math.round(Math.min(drag.startY, drag.currentY) / scale);
      const x2 = Math.round(Math.max(drag.startX, drag.currentX) / scale);
      const y2 = Math.round(Math.max(drag.startY, drag.currentY) / scale);
      setDrag(null);
      if (x2 - x1 > CANVAS_MIN_BOX_SIZE && y2 - y1 > CANVAS_MIN_BOX_SIZE) {
        onDrawBox({ x1, y1, x2, y2 });
      }
      return;
    }

    if (previewBox) {
      onUpdateBox(previewBox.id, {
        x1: previewBox.x1,
        y1: previewBox.y1,
        x2: previewBox.x2,
        y2: previewBox.y2,
      });
    }
    setDrag(null);
    setPreviewBox(null);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name="editor-mode"
            checked={mode === "select"}
            onChange={() => onModeChange("select")}
            className="h-3 w-3"
          />
          {t("bboxEditor.select")}
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="radio"
            name="editor-mode"
            checked={mode === "draw"}
            onChange={() => onModeChange("draw")}
            className="h-3 w-3"
          />
          {t("common.draw")}
        </label>
        <span className="text-gray-300">|</span>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showBBox}
            onChange={(e) => setShowBBox(e.target.checked)}
            className="h-3 w-3 rounded"
          />
          {t("common.bbox")}
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showMask}
            onChange={(e) => setShowMask(e.target.checked)}
            className="h-3 w-3 rounded"
          />
          {t("common.mask")}
        </label>
        {mode === "select" && (
          <span className="text-xs text-gray-400">{t("bboxEditor.selectHint")}</span>
        )}
        {mode === "draw" && (
          <span className="text-xs text-orange-500">{t("detectionCanvas.dragTip")}</span>
        )}
      </div>

      <div className="rounded-lg overflow-hidden bg-gray-100">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className={`block mx-auto ${
            mode === "draw" ? "cursor-crosshair" : "cursor-default"
          }`}
        />
      </div>
    </div>
  );
}

function confidenceColor(conf: number | null | undefined, baseColor: string): string {
  if (conf == null) return baseColor;
  if (conf >= 0.8) return baseColor;
  if (conf >= 0.5) return "#F59E0B";
  return "#EF4444";
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: number[][],
  scale: number,
  color: string,
) {
  if (polygon.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0][0] * scale, polygon[0][1] * scale);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i][0] * scale, polygon[i][1] * scale);
  }
  ctx.closePath();
  ctx.fillStyle = color + "30";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  label: string,
  lineWidth = 2,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
  if (label) {
    ctx.font = "12px system-ui, sans-serif";
    const tw = ctx.measureText(label).width + 8;
    const labelY = y < 18 ? y + 2 : y - 18;
    const textY = y < 18 ? y + 14 : y - 6;
    ctx.fillStyle = color;
    ctx.fillRect(x, labelY, tw, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 4, textY);
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, box: BBox, scale: number) {
  const corners = [
    [box.x1 * scale, box.y1 * scale],
    [box.x2 * scale, box.y1 * scale],
    [box.x1 * scale, box.y2 * scale],
    [box.x2 * scale, box.y2 * scale],
  ];
  ctx.fillStyle = "#2563EB";
  corners.forEach(([x, y]) => {
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  });
}
