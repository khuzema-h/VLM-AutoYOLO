export type RgbChannelRange = [number, number];

export interface RgbThresholdSettings {
  r: RgbChannelRange;
  g: RgbChannelRange;
  b: RgbChannelRange;
  background: "black" | "white";
}

export const DEFAULT_RGB_THRESHOLD: RgbThresholdSettings = {
  r: [0, 255],
  g: [0, 255],
  b: [0, 255],
  background: "black",
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export function applyRgbThresholdToImageData(
  imageData: ImageData,
  settings: RgbThresholdSettings,
): ImageData {
  const [rMin, rMax] = settings.r;
  const [gMin, gMax] = settings.g;
  const [bMin, bMax] = settings.b;
  const bg = settings.background === "white" ? 255 : 0;
  const out = new ImageData(imageData.width, imageData.height);
  const src = imageData.data;
  const dst = out.data;

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const keep =
      r >= rMin && r <= rMax && g >= gMin && g <= gMax && b >= bMin && b <= bMax;
    if (keep) {
      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = 255;
    } else {
      dst[i] = bg;
      dst[i + 1] = bg;
      dst[i + 2] = bg;
      dst[i + 3] = 255;
    }
  }

  return out;
}

export function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function previewRgbThreshold(
  file: File,
  settings: RgbThresholdSettings,
): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const filtered = applyRgbThresholdToImageData(imageData, settings);
  return imageDataToDataUrl(filtered);
}

export async function applyRgbThresholdToFile(
  file: File,
  settings: RgbThresholdSettings,
): Promise<File> {
  const dataUrl = await previewRgbThreshold(file, settings);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const name = file.name.replace(/\.[^.]+$/, ".jpg");
  return new File([blob], name, { type: "image/jpeg" });
}

export async function applyRgbThresholdBatch(
  files: File[],
  settings: RgbThresholdSettings,
  onProgress?: (current: number, total: number) => void,
): Promise<File[]> {
  const results: File[] = [];
  for (let i = 0; i < files.length; i++) {
    results.push(await applyRgbThresholdToFile(files[i], settings));
    onProgress?.(i + 1, files.length);
    if (i % 2 === 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return results;
}
