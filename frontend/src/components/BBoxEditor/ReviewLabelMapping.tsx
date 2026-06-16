import { useTranslation } from "react-i18next";
import { Input } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { ReviewLabelMap } from "@/lib/reviewLabelMap";

interface Props {
  sourceLabels: string[];
  labelMap: ReviewLabelMap;
  onChange: (map: ReviewLabelMap) => void;
}

export function ReviewLabelMapping({ sourceLabels, labelMap, onChange }: Props) {
  const { t } = useTranslation();

  if (sourceLabels.length === 0) return null;

  const hasRenames = sourceLabels.some((src) => (labelMap[src] || src) !== src);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {t("bboxEditor.labelMapping")}
        </label>
        <button
          type="button"
          onClick={() => {
            const reset: ReviewLabelMap = {};
            sourceLabels.forEach((src) => {
              reset[src] = src;
            });
            onChange(reset);
          }}
          className="text-[10px] font-semibold text-primary-600 hover:text-primary-700"
        >
          {t("bboxEditor.resetClassNames")}
        </button>
      </div>

      <div className="flex flex-col gap-1.5 bg-white border border-gray-200/80 rounded-xl p-2.5 max-h-48 overflow-y-auto">
        {sourceLabels.map((src) => (
          <div key={src} className="flex items-center gap-2 min-w-0">
            <span
              className="text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md truncate shrink-0 max-w-[42%]"
              title={src}
            >
              {src}
            </span>
            <ArrowRightOutlined className="text-[10px] text-gray-300 shrink-0" />
            <Input
              size="small"
              className="flex-1 min-w-0"
              value={labelMap[src] ?? src}
              placeholder={src}
              onChange={(e) => onChange({ ...labelMap, [src]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400 leading-snug">
        {hasRenames
          ? t("bboxEditor.labelMappingHintRenamed")
          : t("bboxEditor.labelMappingHint")}
      </p>
    </div>
  );
}
