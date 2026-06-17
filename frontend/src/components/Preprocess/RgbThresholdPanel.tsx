import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Slider, Button, Radio } from "antd";
import { useAppStore } from "@/store/useAppStore";
import { getFileUrl } from "@/lib/cache";
import {
  applyRgbThresholdBatch,
  DEFAULT_RGB_THRESHOLD,
  type RgbChannelRange,
} from "@/lib/rgbThreshold";

interface ChannelSliderProps {
  label: string;
  value: RgbChannelRange;
  onChange: (value: RgbChannelRange) => void;
  disabled?: boolean;
}

function ChannelSlider({ label, value, onChange, disabled }: ChannelSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-mono text-gray-500">
          {value[0]} – {value[1]}
        </span>
      </div>
      <Slider
        range
        min={0}
        max={255}
        value={value}
        onChange={(v) => onChange(v as RgbChannelRange)}
        disabled={disabled}
        tooltip={{ formatter: (v) => String(v ?? 0) }}
      />
    </div>
  );
}

export function RgbThresholdPanel() {
  const { t } = useTranslation();
  const {
    originalFiles,
    files,
    setFiles,
    setPreviewUrl,
    preprocessRgb,
    setPreprocessRgb,
    preprocessApplied,
    setPreprocessApplied,
    setAnnotateSubTab,
  } = useAppStore();

  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const sourceCount = originalFiles.length;
  const hasSources = sourceCount > 0;

  const updateChannel = useCallback(
    (channel: "r" | "g" | "b", range: RgbChannelRange) => {
      setPreprocessRgb({ ...preprocessRgb, [channel]: range });
    },
    [preprocessRgb, setPreprocessRgb],
  );

  const handleApply = useCallback(async () => {
    if (!hasSources) {
      toast.error(t("preprocess.noImages"));
      return;
    }
    setApplying(true);
    setProgress({ current: 0, total: sourceCount });
    try {
      const processed = await applyRgbThresholdBatch(
        originalFiles,
        preprocessRgb,
        (current, total) => setProgress({ current, total }),
      );
      setFiles(processed);
      setPreprocessApplied(true);
      setPreviewUrl(processed.length === 1 ? getFileUrl(processed[0]) : null);
      toast.success(t("preprocess.applySuccess", { count: processed.length }));
      setAnnotateSubTab("detect");
    } catch (e) {
      console.error(e);
      toast.error(t("preprocess.applyFailed"));
    } finally {
      setApplying(false);
      setProgress(null);
    }
  }, [
    hasSources,
    originalFiles,
    preprocessRgb,
    setAnnotateSubTab,
    setFiles,
    setPreprocessApplied,
    setPreviewUrl,
    sourceCount,
    t,
  ]);

  const handleReset = useCallback(() => {
    if (!hasSources) return;
    setFiles(originalFiles);
    setPreprocessApplied(false);
    setPreviewUrl(originalFiles.length === 1 ? getFileUrl(originalFiles[0]) : null);
    toast.success(t("preprocess.resetSuccess"));
  }, [hasSources, originalFiles, setFiles, setPreprocessApplied, setPreviewUrl, t]);

  const handleResetThresholds = useCallback(() => {
    setPreprocessRgb(DEFAULT_RGB_THRESHOLD);
  }, [setPreprocessRgb]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500 leading-relaxed">{t("preprocess.hint")}</p>

      {!hasSources && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-2">
          {t("preprocess.uploadFirst")}
        </p>
      )}

      {hasSources && (
        <p className="text-xs text-gray-500">
          {t("preprocess.imageCount", { count: sourceCount })}
          {preprocessApplied && files.length > 0 && (
            <span className="ml-1 text-primary-600 font-medium">({t("preprocess.applied")})</span>
          )}
        </p>
      )}

      <ChannelSlider
        label={t("preprocess.red")}
        value={preprocessRgb.r}
        onChange={(v) => updateChannel("r", v)}
        disabled={!hasSources || applying}
      />
      <ChannelSlider
        label={t("preprocess.green")}
        value={preprocessRgb.g}
        onChange={(v) => updateChannel("g", v)}
        disabled={!hasSources || applying}
      />
      <ChannelSlider
        label={t("preprocess.blue")}
        value={preprocessRgb.b}
        onChange={(v) => updateChannel("b", v)}
        disabled={!hasSources || applying}
      />

      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {t("preprocess.background")}
        </span>
        <Radio.Group
          value={preprocessRgb.background}
          onChange={(e) => setPreprocessRgb({ ...preprocessRgb, background: e.target.value })}
          disabled={!hasSources || applying}
          size="small"
        >
          <Radio.Button value="black">{t("preprocess.bgBlack")}</Radio.Button>
          <Radio.Button value="white">{t("preprocess.bgWhite")}</Radio.Button>
        </Radio.Group>
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
        <Button
          type="primary"
          block
          loading={applying}
          disabled={!hasSources || applying}
          onClick={() => void handleApply()}
        >
          {progress
            ? t("preprocess.applying", { current: progress.current, total: progress.total })
            : t("preprocess.applyAll")}
        </Button>
        <Button block disabled={!hasSources || !preprocessApplied || applying} onClick={handleReset}>
          {t("preprocess.resetImages")}
        </Button>
        <Button type="link" size="small" className="!text-gray-400" onClick={handleResetThresholds}>
          {t("preprocess.resetThresholds")}
        </Button>
      </div>
    </div>
  );
}
