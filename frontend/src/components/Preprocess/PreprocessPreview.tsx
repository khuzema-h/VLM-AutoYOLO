import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/useAppStore";
import { getFileUrl } from "@/lib/cache";
import { previewRgbThreshold } from "@/lib/rgbThreshold";

export function PreprocessPreview() {
  const { t } = useTranslation();
  const { originalFiles, preprocessRgb } = useAppStore();
  const [index, setIndex] = useState(0);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const safeIndex = originalFiles.length > 0 ? Math.min(index, originalFiles.length - 1) : 0;
  const currentFile = originalFiles[safeIndex] ?? null;
  const originalUrl = useMemo(
    () => (currentFile ? getFileUrl(currentFile) : null),
    [currentFile],
  );

  useEffect(() => {
    if (!currentFile) {
      setProcessedUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void previewRgbThreshold(currentFile, preprocessRgb)
      .then((url) => {
        if (!cancelled) setProcessedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setProcessedUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentFile, preprocessRgb]);

  if (originalFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {t("preprocess.placeholder")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">{t("preprocess.title")}</h2>
        {originalFiles.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button
              type="button"
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              disabled={safeIndex <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              ‹
            </button>
            <span className="font-mono">
              {safeIndex + 1} / {originalFiles.length}
            </span>
            <button
              type="button"
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              disabled={safeIndex >= originalFiles.length - 1}
              onClick={() => setIndex((i) => Math.min(originalFiles.length - 1, i + 1))}
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <PreviewPane label={t("preprocess.original")} url={originalUrl} />
        <PreviewPane
          label={t("preprocess.filtered")}
          url={processedUrl}
          loading={loading}
        />
      </div>

      {originalFiles.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {originalFiles.map((file, i) => (
            <button
              key={`${file.name}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 w-14 h-14 rounded border overflow-hidden ${
                i === safeIndex ? "border-primary-500 ring-2 ring-primary-200" : "border-gray-200"
              }`}
            >
              <img src={getFileUrl(file)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewPane({
  label,
  url,
  loading,
}: {
  label: string;
  url: string | null;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <div className="flex-1 min-h-[240px] rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
        {loading ? (
          <span className="text-xs text-gray-400">…</span>
        ) : url ? (
          <img src={url} alt={label} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}
