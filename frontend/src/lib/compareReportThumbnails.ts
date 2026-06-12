import { fetchAnnotations, compareImageUrl, type CompareBox } from "@/services/api";
import type { CompareReportImageStat } from "@/services/api";
import { mapVlmBoxClass, mapVlmBoxes } from "@/lib/compareLabelMap";

const GT_COLOR = "#10B981";
const VLM_COLOR = "#3B82F6";
const UNMAPPED_COLOR = "#F59E0B";

interface StyledBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  className: string;
  stroke: string;
  dash: number[];
}

function toStyledBoxes(
  boxes: CompareBox[],
  stroke: string,
  dash: number[] = [],
): StyledBox[] {
  return boxes.map((box) => ({
    x1: box.x1,
    y1: box.y1,
    x2: box.x2,
    y2: box.y2,
    className: box.className,
    stroke,
    dash,
  }));
}

function drawStyledBoxes(
  ctx: CanvasRenderingContext2D,
  boxes: StyledBox[],
  scale: number,
  canvasWidth: number,
) {
  const lineWidth = Math.max(1.5, canvasWidth / 220);
  const fontSize = Math.max(9, Math.round(canvasWidth / 38));

  for (const box of boxes) {
    const x = box.x1 * scale;
    const y = box.y1 * scale;
    const w = (box.x2 - box.x1) * scale;
    const h = (box.y2 - box.y1) * scale;
    if (w <= 0 || h <= 0) continue;

    ctx.save();
    ctx.strokeStyle = box.stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(box.dash.map((v) => v * lineWidth));
    ctx.strokeRect(x, y, w, h);

    const label = box.className;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const labelH = fontSize + 4;
    const labelY = Math.max(0, y - labelH);
    ctx.fillStyle = box.stroke;
    ctx.fillRect(x, labelY, textWidth + 8, labelH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 4, labelY + fontSize);
    ctx.restore();
  }
}

function blobToPreviewWithBoxes(
  blob: Blob,
  humanBoxes: CompareBox[],
  mappedVlmBoxes: CompareBox[],
  unmappedVlmBoxes: CompareBox[],
  maxWidth: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      drawStyledBoxes(ctx, toStyledBoxes(humanBoxes, GT_COLOR), scale, width);
      drawStyledBoxes(ctx, toStyledBoxes(mappedVlmBoxes, VLM_COLOR), scale, width);
      drawStyledBoxes(
        ctx,
        toStyledBoxes(unmappedVlmBoxes, UNMAPPED_COLOR, [6, 4]),
        scale,
        width,
      );

      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image"));
    };
    img.src = objectUrl;
  });
}

export async function buildReportThumbnails(
  dataset: string,
  imageStats: CompareReportImageStat[],
  options: {
    vlmLabels: string[];
    labelMap: Record<string, string>;
    maxBBoxArea: number;
    minConfidence: number;
    maxWidth?: number;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<Record<string, string>> {
  const {
    vlmLabels,
    labelMap,
    maxBBoxArea,
    minConfidence,
    maxWidth = 420,
    concurrency = 8,
    onProgress,
    signal,
  } = options;

  const thumbnails: Record<string, string> = {};
  let done = 0;
  const total = imageStats.length;

  for (let index = 0; index < imageStats.length; index += concurrency) {
    if (signal?.aborted) {
      throw new DOMException("Thumbnail export cancelled", "AbortError");
    }

    const batch = imageStats.slice(index, index + concurrency);
    await Promise.all(
      batch.map(async (stat) => {
        try {
          const [imageResponse, annotations] = await Promise.all([
            fetch(compareImageUrl(dataset, stat.imagePath), { signal }),
            fetchAnnotations(
              dataset,
              stat.imagePath,
              stat.labelPath,
              false,
              vlmLabels,
              maxBBoxArea,
              minConfidence,
            ),
          ]);
          if (!imageResponse.ok) return;

          const blob = await imageResponse.blob();
          const mappedVlm = mapVlmBoxes(annotations.vlmBoxes, labelMap);
          const unmappedVlm = annotations.vlmBoxes.filter(
            (box) => !mapVlmBoxClass(box.className, labelMap),
          );

          thumbnails[stat.key] = await blobToPreviewWithBoxes(
            blob,
            annotations.humanBoxes,
            mappedVlm,
            unmappedVlm,
            maxWidth,
          );
        } catch (err) {
          if (signal?.aborted) throw err;
        } finally {
          done += 1;
          onProgress?.(done, total);
        }
      }),
    );
  }

  return thumbnails;
}
