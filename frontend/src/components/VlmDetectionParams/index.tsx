import { useTranslation } from "react-i18next";
import { Slider } from "antd";

interface Props {
  maxBBoxArea: number;
  minConfidence: number;
  cropVerification: boolean;
  verificationVlm: "qwen3_vl" | "locate_anything";
  onMaxBBoxAreaChange: (value: number) => void;
  onMinConfidenceChange: (value: number) => void;
  onCropVerificationChange?: (enabled: boolean) => void;
  onVerificationVlmChange?: (backend: "qwen3_vl" | "locate_anything") => void;
  showCropVerification?: boolean;
  disabled?: boolean;
}

export function VlmDetectionParams({
  maxBBoxArea,
  minConfidence,
  cropVerification = false,
  verificationVlm = "qwen3_vl",
  onMaxBBoxAreaChange,
  onMinConfidenceChange,
  onCropVerificationChange,
  onVerificationVlmChange,
  showCropVerification = false,
  disabled,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("compare.maxBBoxArea")}
          </label>
          <span className="text-xs font-mono font-bold text-primary-600">
            {Math.round(maxBBoxArea * 100)}%
          </span>
        </div>
        <Slider
          min={0.05}
          max={1}
          step={0.05}
          value={maxBBoxArea}
          onChange={onMaxBBoxAreaChange}
          disabled={disabled}
          tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }}
        />
        <p className="text-[10px] text-gray-400 leading-snug">{t("compare.maxBBoxAreaHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("compare.minConfidence")}
          </label>
          <span className="text-xs font-mono font-bold text-primary-600">
            {Math.round(minConfidence * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={0.95}
          step={0.05}
          value={minConfidence}
          onChange={onMinConfidenceChange}
          disabled={disabled}
          tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
        />
        <p className="text-[10px] text-gray-400 leading-snug">{t("compare.minConfidenceHint")}</p>
      </div>

      {showCropVerification && onCropVerificationChange && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={cropVerification}
              onChange={(e) => onCropVerificationChange(e.target.checked)}
              disabled={disabled}
              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary-600"
            />
            <span>
              <span className="font-semibold text-gray-700">{t("preprocess.cropVerification")}</span>
              <span className="block text-[10px] text-gray-400 leading-snug mt-0.5">
                {t("preprocess.cropVerificationHint")}
              </span>
            </span>
          </label>
          {cropVerification && onVerificationVlmChange && (
            <div className="flex flex-col gap-1 pl-5">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {t("preprocess.verificationModel")}
              </span>
              <select
                value={verificationVlm}
                onChange={(e) =>
                  onVerificationVlmChange(e.target.value as "qwen3_vl" | "locate_anything")
                }
                disabled={disabled}
                className="text-xs rounded border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
              >
                <option value="qwen3_vl">{t("preprocess.verificationQwen3Vl")}</option>
                <option value="locate_anything">{t("preprocess.verificationLocateAnything")}</option>
              </select>
              <p className="text-[10px] text-gray-400 leading-snug">
                {verificationVlm === "qwen3_vl"
                  ? t("preprocess.verificationQwen3VlHint")
                  : t("preprocess.verificationLocateAnythingHint")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
