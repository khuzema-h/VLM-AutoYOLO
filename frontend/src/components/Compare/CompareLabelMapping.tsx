import { Select } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { CompareLabelMap } from "@/lib/compareLabelMap";
import { autoMapByName } from "@/lib/compareLabelMap";

interface Props {
  vlmLabels: string[];
  gtClasses: string[];
  labelMap: CompareLabelMap;
  onChange: (map: CompareLabelMap) => void;
}

export function CompareLabelMapping({ vlmLabels, gtClasses, labelMap, onChange }: Props) {
  if (vlmLabels.length === 0) return null;

  const needsMapping = vlmLabels.some(
    (vlm) => labelMap[vlm] !== vlm || !gtClasses.includes(vlm),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Label Mapping
        </label>
        <button
          type="button"
          onClick={() => onChange(autoMapByName(vlmLabels, gtClasses))}
          className="text-[10px] font-semibold text-primary-600 hover:text-primary-700"
        >
          Auto-map by name
        </button>
      </div>

      <div className="flex flex-col gap-1.5 bg-white border border-gray-200/80 rounded-xl p-2.5">
        {vlmLabels.map((vlmLabel) => (
          <div key={vlmLabel} className="flex items-center gap-2 min-w-0">
            <span
              className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md truncate shrink-0 max-w-[42%]"
              title={vlmLabel}
            >
              {vlmLabel}
            </span>
            <ArrowRightOutlined className="text-[10px] text-gray-300 shrink-0" />
            <Select
              size="small"
              className="flex-1 min-w-0"
              value={labelMap[vlmLabel] || undefined}
              placeholder="No mapping"
              allowClear
              onChange={(gtClass) =>
                onChange({ ...labelMap, [vlmLabel]: gtClass ?? "" })
              }
              options={gtClasses.map((gt) => ({ value: gt, label: gt }))}
            />
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400 leading-snug">
        {needsMapping
          ? "Map each VLM label to a ground-truth class for matching and metrics."
          : "VLM labels match dataset classes. Adjust mapping if you use alternate names."}
      </p>
    </div>
  );
}
