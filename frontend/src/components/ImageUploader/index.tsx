import { type DragEvent } from "react";
import { collectDroppedFiles } from "@/lib/droppedFiles";
import { buildPreviewUrls, processImageFiles } from "@/lib/processImageFiles";

interface Props {
  onFiles: (files: File[]) => void;
  onClear?: () => void;
  onProcessingChange?: (processing: boolean) => void;
  disabled?: boolean;
}

export function ImageUploader({ onFiles, onClear, onProcessingChange, disabled }: Props) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewsRef = useRef<string[]>([]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  const setProcessingState = useCallback(
    (active: boolean) => {
      setProcessing(active);
      onProcessingChange?.(active);
    },
    [onProcessingChange],
  );

  const handle = useCallback(
    async (files: FileList | File[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
      setPreviews([]);
      setFileCount(0);
      setProcessingState(true);
      setProcessProgress({ current: 0, total: 0 });

      try {
        const processed = await processImageFiles(files, {
          signal: controller.signal,
          onProgress: (current, total) => setProcessProgress({ current, total }),
        });
        if (controller.signal.aborted) return;

        setPreviews(buildPreviewUrls(processed));
        setFileCount(processed.length);
        onFiles(processed);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      } finally {
        if (!controller.signal.aborted) {
          setProcessingState(false);
        }
      }
    },
    [onFiles, setProcessingState],
  );

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
    setFileCount(0);
    setProcessingState(false);
    onFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    onClear?.();
  }, [previews, onFiles, onClear, setProcessingState]);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = await collectDroppedFiles(e.dataTransfer);
      if (dropped.length > 0) handle(dropped);
    },
    [handle],
  );

  const displayCount = fileCount || previews.length;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !processing && inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors
          ${disabled || processing ? "pointer-events-none opacity-50" : ""}
          ${
            dragOver
              ? "border-primary-500 bg-primary-50"
              : "border-gray-300 hover:border-gray-400 bg-gray-50"
          }
        `}
      >
        {processing ? (
          <div className="text-gray-500 text-sm flex flex-col gap-1">
            <span>{t("imageUploader.compressing")}</span>
            {processProgress.total > 0 && (
              <span className="text-xs text-gray-400">
                {t("imageUploader.processingImages", {
                  current: processProgress.current,
                  total: processProgress.total,
                })}
              </span>
            )}
          </div>
        ) : displayCount > 0 ? (
          displayCount === 1 ? (
            <div className="flex flex-col items-center gap-2">
              <img src={previews[0]} alt="" className="w-full max-h-44 rounded object-contain" />
              <p className="text-xs text-gray-400">{t("imageUploader.clickToChange")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 justify-center">
              {previews.map((url, i) => (
                <img key={i} src={url} alt="" className="h-20 w-20 rounded object-cover" />
              ))}
              {displayCount > previews.length && (
                <span className="h-20 w-20 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                  +{displayCount - previews.length}
                </span>
              )}
              <p className="w-full text-xs text-gray-400 mt-1">
                {t("imageUploader.countImages", { count: displayCount })}
              </p>
            </div>
          )
        ) : (
          <div className="text-gray-500">
            <p className="text-sm">{t("imageUploader.dragToUpload")}</p>
            <p className="mt-1 text-xs text-gray-400">{t("imageUploader.supportInfo")}</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700 underline underline-offset-2 pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
            >
              {t("imageUploader.selectFolder")}
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled || processing}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handle(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled || processing}
          // @ts-expect-error non-standard folder picker attributes
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {displayCount > 0 && !processing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="mt-2 w-full rounded border border-red-200 bg-red-50 py-1 text-[11px] text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
        >
          {t("imageUploader.clearAll")} ({displayCount})
        </button>
      )}
    </div>
  );
}
