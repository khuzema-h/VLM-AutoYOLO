import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "antd";
import toast from "react-hot-toast";
import { downloadBlob, exportBatch } from "@/services/api";
import type { Detection } from "@/types";

interface Props {
  items: Detection[];
  categories: string[];
}

export function ReviewExportPanel({ items, categories }: Props) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const totalBoxes = useMemo(
    () => items.reduce((sum, d) => sum + d.boxes.length, 0),
    [items],
  );

  const classNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((d) => d.boxes.forEach((b) => set.add(b.className)));
    categories.forEach((c) => set.add(c));
    return [...set].sort();
  }, [items, categories]);

  const handleExport = async (format: string) => {
    if (items.length === 0) return;
    setExporting(true);
    try {
      const ids = items.map((d) => d.id);
      const labels: Record<string, string> = {
        yolo: "YOLO",
        "yolo-seg": "YOLO_Seg",
        coco: "COCO",
        voc: "VOC",
        createml: "CreateML",
      };
      const blob = await exportBatch(ids, format);
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
      {classNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {classNames.map((c) => (
            <span
              key={c}
              className="text-[10px] font-medium bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <Dropdown
        disabled={items.length === 0 || exporting}
        menu={{
          items: [
            { key: "yolo", label: "YOLO (.txt)" },
            { key: "yolo-seg", label: "YOLO Segmentation" },
            { key: "coco", label: "COCO (.json)" },
            { key: "voc", label: "Pascal VOC (.xml)" },
            { key: "createml", label: "CreateML (.json)" },
          ],
          onClick: ({ key }) => handleExport(key),
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
      <p className="text-[10px] text-gray-400 leading-relaxed">{t("bboxEditor.exportHint")}</p>
    </div>
  );
}
