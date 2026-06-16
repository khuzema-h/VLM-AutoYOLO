import type { BBox } from "@/types";

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

const HANDLE_RADIUS = 6;

export function hitTestBox(
  boxes: BBox[],
  screenX: number,
  screenY: number,
  scale: number,
  hiddenIds: Set<string>,
): BBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (hiddenIds.has(box.id)) continue;
    const x1 = box.x1 * scale;
    const y1 = box.y1 * scale;
    const x2 = box.x2 * scale;
    const y2 = box.y2 * scale;
    if (screenX >= x1 && screenX <= x2 && screenY >= y1 && screenY <= y2) {
      return box;
    }
  }
  return null;
}

export function hitTestHandle(
  box: BBox,
  screenX: number,
  screenY: number,
  scale: number,
): ResizeHandle | null {
  const corners: { handle: ResizeHandle; x: number; y: number }[] = [
    { handle: "nw", x: box.x1 * scale, y: box.y1 * scale },
    { handle: "ne", x: box.x2 * scale, y: box.y1 * scale },
    { handle: "sw", x: box.x1 * scale, y: box.y2 * scale },
    { handle: "se", x: box.x2 * scale, y: box.y2 * scale },
  ];
  for (const { handle, x, y } of corners) {
    if (Math.hypot(screenX - x, screenY - y) <= HANDLE_RADIUS) {
      return handle;
    }
  }
  return null;
}

export function clampBox(
  box: { x1: number; y1: number; x2: number; y2: number },
  imgW: number,
  imgH: number,
  minSize = 4,
): { x1: number; y1: number; x2: number; y2: number } {
  let { x1, y1, x2, y2 } = box;
  if (x1 > x2) [x1, x2] = [x2, x1];
  if (y1 > y2) [y1, y2] = [y2, y1];

  x1 = Math.max(0, Math.min(x1, imgW - minSize));
  y1 = Math.max(0, Math.min(y1, imgH - minSize));
  x2 = Math.max(x1 + minSize, Math.min(x2, imgW));
  y2 = Math.max(y1 + minSize, Math.min(y2, imgH));

  return {
    x1: Math.round(x1),
    y1: Math.round(y1),
    x2: Math.round(x2),
    y2: Math.round(y2),
  };
}

export function resizeBox(
  orig: BBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): { x1: number; y1: number; x2: number; y2: number } {
  let { x1, y1, x2, y2 } = orig;
  switch (handle) {
    case "nw":
      x1 += dx;
      y1 += dy;
      break;
    case "ne":
      x2 += dx;
      y1 += dy;
      break;
    case "sw":
      x1 += dx;
      y2 += dy;
      break;
    case "se":
      x2 += dx;
      y2 += dy;
      break;
  }
  return { x1, y1, x2, y2 };
}
