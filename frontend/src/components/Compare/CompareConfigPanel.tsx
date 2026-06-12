import { useState, useEffect } from "react";
import { Select, Progress, Button, Popconfirm, Slider, Input, Alert } from "antd";
import {
  DatabaseOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { CategoryInput } from "@/components/CategoryInput";
import { CompareLabelMapping } from "@/components/Compare/CompareLabelMapping";
import { useCompareContext } from "@/components/Compare/CompareContext";
import { useAppStore } from "@/store/useAppStore";

export function CompareConfigPanel() {
  const { t } = useTranslation();
  const {
    setCompareImage,
    setCompareVlmLabels,
    setCompareGtClasses,
  } = useAppStore();
  const {
    compareDataset,
    setCompareDataset,
    compareVlmLabels,
    compareLabelMap,
    setCompareLabelMap,
    datasets,
    classes,
    stats,
    taskStatus,
    loadingDatasets,
    activeDatasetObj,
    compareMaxBBoxArea,
    compareMinConfidence,
    handleVlmLabelsChange,
    handleMaxBBoxAreaChange,
    handleMinConfidenceChange,
    handleStartPrecompute,
    handleCancelPrecompute,
    handleClearVlmCache,
    exportOutputName,
    setExportOutputName,
    exporting,
    handleExportVlmDataset,
  } = useCompareContext();

  const [localExportName, setLocalExportName] = useState(exportOutputName);
  useEffect(() => {
    setLocalExportName(exportOutputName);
  }, [exportOutputName]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Select Dataset
        </label>
        <Select
          loading={loadingDatasets}
          value={compareDataset}
          onChange={(val) => {
            setCompareDataset(val);
            setCompareImage(null);
            setCompareVlmLabels([]);
            setCompareGtClasses([]);
            setCompareLabelMap({});
          }}
          className="w-full"
          placeholder="Choose a dataset"
          suffixIcon={<DatabaseOutlined />}
          options={datasets.map((d) => ({
            value: d.name,
            label: (
              <span className="font-semibold text-gray-700">
                {d.name} ({d.imageCount} files)
              </span>
            ),
          }))}
        />
      </div>

      {activeDatasetObj && (
        <div className="text-xs text-gray-400 bg-gray-50/70 border border-gray-100 p-2.5 rounded-lg flex flex-col gap-1">
          <div>
            <span className="font-bold text-gray-600">Ground Truth Classes: </span>
            {classes.join(", ") || "None"}
          </div>
          <div className="flex justify-between mt-1 text-[11px]">
            <span>Train split: {activeDatasetObj.trainCount} images</span>
            <span>Test split: {activeDatasetObj.testCount} images</span>
          </div>
        </div>
      )}

      {compareDataset && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              VLM Target Labels
            </label>
            {classes.length > 0 && (
              <button
                type="button"
                onClick={() => handleVlmLabelsChange([...classes])}
                className="text-[10px] font-semibold text-primary-600 hover:text-primary-700"
              >
                Reset to dataset
              </button>
            )}
          </div>
          <CategoryInput
            categories={compareVlmLabels}
            onChange={handleVlmLabelsChange}
            recentCategories={[...classes, ...compareVlmLabels]}
          />
          <p className="text-[10px] text-gray-400 leading-snug">
            Labels sent to LocateAnything-3B. Ground truth always uses dataset classes.
          </p>

          <CompareLabelMapping
            vlmLabels={compareVlmLabels}
            gtClasses={classes}
            labelMap={compareLabelMap}
            onChange={setCompareLabelMap}
          />

          <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {t("compare.maxBBoxArea")}
              </label>
              <span className="text-xs font-mono font-bold text-primary-600">
                {Math.round(compareMaxBBoxArea * 100)}%
              </span>
            </div>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={compareMaxBBoxArea}
              onChange={handleMaxBBoxAreaChange}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }}
            />
            <p className="text-[10px] text-gray-400 leading-snug">
              {t("compare.maxBBoxAreaHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {t("compare.minConfidence")}
              </label>
              <span className="text-xs font-mono font-bold text-primary-600">
                {Math.round(compareMinConfidence * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={0.95}
              step={0.05}
              value={compareMinConfidence}
              onChange={handleMinConfidenceChange}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
            />
            <p className="text-[10px] text-gray-400 leading-snug">
              {t("compare.minConfidenceHint")}
            </p>
          </div>
        </div>
      )}

      {stats && (
        <div className="bg-white border border-gray-200/80 rounded-xl p-3.5 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-600">VLM Predictions Cache</span>
            <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
              {stats.cached} / {stats.total} cached ({stats.progressPercent}%)
            </span>
          </div>

          <Progress
            percent={stats.progressPercent}
            showInfo={false}
            strokeColor={{ "0%": "#3B82F6", "100%": "#10B981" }}
            status="active"
            className="m-0"
          />

          {taskStatus && taskStatus.status !== "idle" && (
            <div className="text-[11px] bg-slate-50/80 border border-slate-100 p-2 rounded flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-500 uppercase tracking-wide text-[9px]">
                  Task: {taskStatus.status}
                </span>
                {taskStatus.status === "running" && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                )}
              </div>

              <div className="text-gray-600 font-medium truncate">{taskStatus.currentImage}</div>

              {taskStatus.status === "running" && (
                <div className="flex items-center gap-2 mt-0.5">
                  <Progress
                    percent={Math.round((taskStatus.current / taskStatus.total) * 100)}
                    size="small"
                    className="flex-1 m-0"
                  />
                  <span className="text-gray-400 shrink-0">
                    {taskStatus.current}/{taskStatus.total}
                  </span>
                </div>
              )}

              {taskStatus.error && (
                <div className="text-red-500 font-semibold text-[10px]">
                  Error: {taskStatus.error}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-1">
            {taskStatus?.status === "running" ? (
              <Button
                danger
                type="dashed"
                icon={<StopOutlined />}
                onClick={handleCancelPrecompute}
                className="w-full font-bold flex items-center justify-center py-4"
              >
                Cancel Precomputing
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartPrecompute}
                disabled={stats.cached === stats.total || compareVlmLabels.length === 0}
                className="w-full font-bold bg-primary-600 hover:bg-primary-700 border-none flex items-center justify-center py-4"
              >
                Precompute VLM BBoxes
              </Button>
            )}
          </div>

          {stats.cached === stats.total && stats.total > 0 && taskStatus?.status !== "running" && (
            <Alert
              type="success"
              showIcon
              message={t("compare.reportReadyHint")}
              className="text-xs"
            />
          )}

          {stats.cached === stats.total && stats.total > 0 && taskStatus?.status !== "running" && (
            <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                {t("compare.exportDataset")}
              </label>
              <Input
                value={localExportName}
                onChange={(e) => setLocalExportName(e.target.value)}
                onBlur={() => setExportOutputName(localExportName.trim())}
                placeholder={t("compare.exportDatasetPlaceholder")}
                disabled={exporting}
              />
              <p className="text-[10px] text-gray-400 leading-snug">{t("compare.exportDatasetHint")}</p>
              <Button
                type="default"
                icon={<ExportOutlined />}
                loading={exporting}
                disabled={!localExportName.trim() || compareVlmLabels.length === 0}
                onClick={() => {
                  const name = localExportName.trim();
                  setExportOutputName(name);
                  handleExportVlmDataset(name);
                }}
                className="w-full font-semibold flex items-center justify-center"
              >
                {t("compare.exportDatasetButton")}
              </Button>
            </div>
          )}

          {stats.cached > 0 && taskStatus?.status !== "running" && (
            <Popconfirm
              title={t("compare.clearCacheConfirm", { count: stats.cached })}
              onConfirm={handleClearVlmCache}
              okText={t("common.delete")}
              cancelText={t("common.cancel")}
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                type="dashed"
                icon={<DeleteOutlined />}
                className="w-full font-semibold flex items-center justify-center"
              >
                {t("compare.clearCache")} ({stats.cached})
              </Button>
            </Popconfirm>
          )}
        </div>
      )}
    </div>
  );
}
