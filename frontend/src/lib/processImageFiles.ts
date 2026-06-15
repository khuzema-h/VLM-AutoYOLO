import { filterImageFiles } from "@/lib/droppedFiles";

const MAX_LONG_SIDE = 1280;
const JPEG_QUALITY = 0.75;
export const BULK_IMAGE_THRESHOLD = 40;
const YIELD_EVERY = 2;
const BULK_PROGRESS_EVERY = 50;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const longest = Math.max(w, h);
      if (longest <= MAX_LONG_SIDE && file.type === "image/jpeg") {
        resolve(file);
        return;
      }
      const scale = Math.min(1, MAX_LONG_SIDE / longest);
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      canvas.getContext("2d")!.drawImage(img, 0, 0, dw, dh);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export async function processImageFiles(
  fileList: FileList | File[],
  options: {
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<File[]> {
  const images = filterImageFiles(Array.from(fileList));
  const skipCompress = images.length > BULK_IMAGE_THRESHOLD;
  const results: File[] = [];

  for (let i = 0; i < images.length; i++) {
    if (options.signal?.aborted) {
      throw new DOMException("Image import cancelled", "AbortError");
    }

    const file = images[i];
    if (skipCompress) {
      results.push(file);
    } else {
      try {
        results.push(await compressImage(file));
      } catch {
        results.push(file);
      }
    }

    const done = i + 1;
    if (options.onProgress) {
      const reportEvery = skipCompress ? BULK_PROGRESS_EVERY : 1;
      if (done === images.length || done % reportEvery === 0) {
        options.onProgress(done, images.length);
      }
    }

    if (skipCompress || i % YIELD_EVERY === 1) {
      await yieldToMain();
    }
  }

  return results;
}

export function buildPreviewUrls(files: File[], limit = 8): string[] {
  return files.slice(0, limit).map((file) => URL.createObjectURL(file));
}
