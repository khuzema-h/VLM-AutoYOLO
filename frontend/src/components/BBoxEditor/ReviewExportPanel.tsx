import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "antd";
import toast from "react-hot-toast";
import { downloadBlob, exportBatch } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import {
  buildExportLabelMap,
  collectClassNamesFromDetections,
  mergeReviewLabelMap,
} from "@/lib/reviewLabelMap";
import { ReviewLabelMapping } from "./ReviewLabelMapping";
import { DatasetImportModal } from "@/components/DatasetImportModal";
import type { Detection } from "@/types";

interface Props {
  items: Detection[];
  categories: string[];
}

export function ReviewExportPanel({ items, categories }: Props) {
  const { t } = useTranslation();
  const { reviewLabelMap, setReviewLabelMap } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const sourceLabels = useMemo(
    () => collectClassNamesFromDetections(items, categories),
    [items, categories],
  );

  useEffect(() => {
    setReviewLabelMap(
      mergeReviewLabelMap(useAppStore.getState().reviewLabelMap, sourceLabels),
    );
  }, [sourceLabels.join("\0"), setReviewLabelMap]);

  const totalBoxes = useMemo(
    () => items.reduce((sum, d) => sum + d.boxes.length, 0),
    [items],
  );

  const exportClassNames = useMemo(() => {
    const names = new Set<string>();
    sourceLabels.forEach((src) => names.add(reviewLabelMap[src]?.trim() || src));
    return [...names].sort();
  }, [sourceLabels, reviewLabelMap]);

  const handleExport = async (format: string) => {
    if (items.length === 0) return;
    setExporting(true);
    try {
      const ids = items.map((d) => d.id);
      const labelMap = format === "autoyolo" ? undefined : buildExportLabelMap(reviewLabelMap);
      const labels: Record<string, string> = {
        autoyolo: "VLM_AutoYOLO_Project",
        yolo: "YOLO",
        "yolo-seg": "YOLO_Seg",
        coco: "COCO",
        voc: "VOC",
        createml: "CreateML",
      };
      const blob = await exportBatch(ids, format, labelMap);
      downloadBlob(blob, `${labels[format] ?? format}_dataset.zip`);
      toast.success(t("bboxEditor.exportSuccess", { count: items.length }));
    } catch (e) {
      console.error("Export failed:", e);
      toast.error(t("detection.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
      <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
        {t("bboxEditor.reviewSummary")}
      </h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-white border border-gray-100 px-2 py-1.5">
          <span className="text-gray-400 block">{t("bboxEditor.imageCount")}</span>
          <span className="font-semibold text-gray-800">{items.length}</span>
        </div>
        <div className="rounded bg-white border border-gray-100 px-2 py-1.5">
          <span className="text-gray-400 block">{t("bboxEditor.boxCount")}</span>
          <span className="font-semibold text-gray-800">{totalBoxes}</span>
        </div>
      </div>

      <ReviewLabelMapping
        sourceLabels={sourceLabels}
        labelMap={reviewLabelMap}
        onChange={setReviewLabelMap}
      />

      {exportClassNames.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-400 mb-1">{t("bboxEditor.exportClasses")}</p>
          <div className="flex flex-wrap gap-1">
            {exportClassNames.map((c) => (
              <span
                key={c}
                className="text-[10px] font-medium bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <Dropdown
        disabled={items.length === 0 || exporting}
        menu={{
          items: [
            { key: "autoyolo", label: t("bboxEditor.exportProject") },
            { type: "divider" },
            { key: "yolo", label: "YOLO (.txt)" },
            { key: "yolo-seg", label: "YOLO Segmentation" },
            { key: "coco", label: "COCO (.json)" },
            { key: "voc", label: "Pascal VOC (.xml)" },
            { key: "createml", label: "CreateML (.json)" },
          ],
          onClick: ({ key }) => void handleExport(key),
        }}
        trigger={["click"]}
      >
        <button
          type="button"
          disabled={items.length === 0 || exporting}
          className="w-full rounded bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {exporting
            ? t("common.loading")
            : t("bboxEditor.exportDataset", { count: items.length })}
        </button>
      </Dropdown>
      <button
        type="button"
        onClick={() => setImportOpen(true)}
        className="w-full rounded border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {t("bboxEditor.importProject")}
      </button>
      <p className="text-[10px] text-gray-400 leading-relaxed">{t("bboxEditor.exportHint")}</p>
      <DatasetImportModal open={importOpen} onClose={() => setImportOpen(false)} defaultFormat="autoyolo" />
    </div>
  );
}
