const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT_RE.test(file.name);
}

function fileEntryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectory(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = dir.createReader();
  const entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    entries.push(...batch);
  } while (batch.length > 0);

  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await fileEntryToFile(entry as FileSystemFileEntry));
    } else if (entry.isDirectory) {
      files.push(...(await readDirectory(entry as FileSystemDirectoryEntry)));
    }
  }
  return files;
}

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await fileEntryToFile(entry as FileSystemFileEntry)];
  }
  if (entry.isDirectory) {
    return readDirectory(entry as FileSystemDirectoryEntry);
  }
  return [];
}

/** Collect all files from a drop, expanding nested folders when supported. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const hasEntryApi = Array.from(items).some(
      (item) => item.kind === "file" && typeof item.webkitGetAsEntry === "function",
    );
    if (hasEntryApi) {
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          files.push(...(await readEntry(entry)));
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) return files;
    }
  }

  return Array.from(dataTransfer.files);
}

export function filterImageFiles(files: File[]): File[] {
  return files.filter(isImageFile);
}
