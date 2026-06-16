import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ImageUploader } from "@/components/ImageUploader";
import { HistoryList } from "@/components/HistoryList";
import { BatchProgress } from "@/components/BatchProgress";
import { ModelStatus } from "@/components/ModelStatus";
import { Sam3Status } from "@/components/Sam3Status";
import { TrainingPanel } from "@/components/TrainingPanel";
import { VideoPanel } from "@/components/VideoPanel";
import { ValidationSettings } from "@/components/ValidationSettings";
import { FilterPanel } from "@/components/FilterPanel";
import { HistorySkeleton } from "@/components/LoadingSkeleton";
import { SidebarHeader } from "./Header";
import { DetectionControls } from "./DetectionControls";
import type { Detection } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { CompareSidebar } from "@/components/Compare/CompareSidebar";
import { ReviewExportPanel } from "@/components/BBoxEditor/ReviewExportPanel";
import { batchFileMap, getFileUrl } from "@/lib/cache";
import { API_BASE } from "@/lib/constants";
import { getDetection } from "@/services/api";

export interface SidebarProps {
  recentCategories: string[];
  handleFiles: (fs: File[]) => void;
  handleDetect: () => void;
  handleSelectHistory: (det: Detection) => void;
  loading: boolean;
  batchProgress: { current: number; total: number };
  batchResults: Detection[];
  cancel: () => void;
  historyQuery: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
  allItems: Detection[];
  total: number;
  result: Detection | null;
  setResult: (result: Detection | null) => void;
  handleSelectKeyframe: (files: File[]) => void;
  filesProcessing: boolean;
  setFilesProcessing: (processing: boolean) => void;
  reviewItems: Detection[];
}

export function Sidebar({
  recentCategories,
  handleFiles,
  handleDetect,
  handleSelectHistory,
  loading,
  batchProgress,
  batchResults,
  cancel,
  historyQuery,
  allItems,
  total,
  result,
  setResult,
  handleSelectKeyframe,
  filesProcessing,
  setFilesProcessing,
  reviewItems,
}: SidebarProps) {
  const { t } = useTranslation();
  const {
    appMode, setAppMode,
    validateModelSource, setValidateModelSource,
    selectedTrainedJobId, setSelectedTrainedJobId,
    inputMode, setInputMode,
    files, setFiles,
    setPreviewUrl,
    setBatchResults: setBatch,
    setUseSam2,
    useSam3, setUseSam3,
    validateVideoId, setValidateVideoId,
    setValidateRunKey,
    externalModelFile, setExternalModelFile,
    validateConf, setValidateConf,
    validateIou, setValidateIou,
    filterMode, setFilterMode,
    nmsIou, setNmsIou,
    setHiddenIndices,
    categories,
  } = useAppStore();

  return (
    <aside
      className={`flex-shrink-0 border-r border-gray-200 bg-white flex flex-col gap-4 relative ${
        appMode === "compare" || appMode === "review"
          ? "overflow-hidden min-h-0 h-full"
          : "overflow-y-auto"
      }`}
      style={{
        width: appMode === "compare" ? 360 : appMode === "review" ? 320 : 440,
        padding: "1.25rem",
      }}
    >
      <SidebarHeader />

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200 mb-2">
        {(["annotate", "review", "validate", "compare"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setAppMode(m);
              if (m === "validate" || m === "compare") setResult(null);
              setValidateVideoId(null);
              if (m === "review" && reviewItems.length > 0) {
                const current =
                  result && reviewItems.some((d) => d.id === result.id)
                    ? result
                    : reviewItems[0];
                void (async () => {
                  try {
                    const full = await getDetection(current.id);
                    setResult(full);
                    const file = batchFileMap.get(full.id);
                    setPreviewUrl(
                      file ? getFileUrl(file) : `${API_BASE}/detections/${full.id}/image`,
                    );
                  } catch (e) {
                    console.error("Failed to open review tab:", e);
                  }
                })();
              }
            }}
            className={`flex-1 pb-3 pt-1 text-xs font-bold transition-all duration-200 relative text-center cursor-pointer ${
              appMode === m
                ? "text-primary-600 border-b-2 border-primary-600 scale-[1.02]"
                : "text-gray-400 hover:text-gray-600 border-b-2 border-transparent"
            }`}
          >
            {{ annotate: t("common.annotate"), review: t("common.review"), validate: t("common.validate"), compare: t("common.compare") }[m]}
          </button>
        ))}
      </div>

      {appMode === "compare" ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CompareSidebar />
        </div>
      ) : appMode === "review" ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">{t("bboxEditor.sidebarHint")}</p>
          <ReviewExportPanel items={reviewItems} categories={categories} />
        </div>
      ) : (
        <>
          {/* Model selector */}
          <div className="flex rounded-lg border border-gray-200/60 bg-gray-100/80 p-1 relative min-h-[36px] mb-2 shadow-inner">
            {(["vlm+sam2", "sam3"] as const).map((mode) => {
              const active = mode === "sam3" ? useSam3 : !useSam3;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setUseSam2(mode === "vlm+sam2"); setUseSam3(mode === "sam3"); }}
                  className={`flex-1 text-xs font-semibold px-3 py-1 rounded-md transition-all duration-300 cursor-pointer relative z-10 ${
                    active
                      ? "bg-white text-primary-600 shadow-sm ring-1 ring-black/5"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                  }`}
                >
                  {mode === "sam3" ? "SAM3" : "VLM + SAM2"}
                </button>
              );
            })}
          </div>

          {useSam3 ? <Sam3Status /> : <ModelStatus />}

          {appMode === "validate" && (
            <ValidationSettings
              selectedJobId={selectedTrainedJobId}
              onSelectJob={setSelectedTrainedJobId}
              modelSource={validateModelSource}
              onSourceChange={setValidateModelSource}
              externalFile={externalModelFile}
              onExternalFile={setExternalModelFile}
              validateConf={validateConf}
              onConfChange={setValidateConf}
              validateIou={validateIou}
              onIouChange={setValidateIou}
            />
          )}

          {/* Input mode: Image / Video */}
          <div>
            <div className="flex gap-1 rounded bg-gray-100 p-0.5 mb-2">
              {(["image", "video"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setInputMode(mode); setFiles([]); setPreviewUrl(null); setBatch([]); }}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    inputMode === mode
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {{ image: t("common.image"), video: t("common.video") }[mode]}
                </button>
              ))}
            </div>
            {inputMode === "image" ? (
              <ImageUploader
                onFiles={handleFiles}
                onClear={() => { setFiles([]); setPreviewUrl(null); setBatch([]); }}
                onProcessingChange={setFilesProcessing}
                disabled={loading}
              />
            ) : (
              <VideoPanel
                onLoadKeyframes={handleSelectKeyframe}
                onValidateVideo={
                  appMode === "validate"
                    ? (videoId) => { setValidateVideoId(videoId); setValidateRunKey((k) => k + 1); }
                    : undefined
                }
                disabled={loading}
              />
            )}
          </div>

          {!(appMode === "validate" && inputMode === "video" && validateVideoId) && (
            <DetectionControls
              recentCategories={recentCategories}
              loading={loading || filesProcessing}
              filesCount={files.length}
              batchProgress={batchProgress}
              onDetect={handleDetect}
            />
          )}

          {appMode === "validate" && inputMode === "video" && (
            <div className="text-xs text-gray-400 text-center py-2">
              {validateVideoId ? t("home.placeholderVideoRunning") : t("home.placeholderSelectVideo")}
            </div>
          )}

          <BatchProgress
            current={batchProgress.current}
            total={batchProgress.total}
            completed={batchResults.length}
            onCancel={cancel}
          />

          {result && (
            <FilterPanel
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              nmsIou={nmsIou}
              onNmsIouChange={setNmsIou}
              setHiddenIndices={setHiddenIndices}
            />
          )}

          <hr className="border-gray-100" />

          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">{t("common.history")}</p>
            <Suspense fallback={<HistorySkeleton />}>
              <ErrorBoundary>
                <HistoryList
                  allItems={allItems}
                  total={total}
                  hasNextPage={historyQuery.hasNextPage}
                  isFetchingNextPage={historyQuery.isFetchingNextPage}
                  fetchNextPage={historyQuery.fetchNextPage}
                  onSelect={handleSelectHistory}
                  onClearAll={() => {
                    setResult(null);
                    setPreviewUrl(null);
                    setBatch([]);
                  }}
                />
              </ErrorBoundary>
            </Suspense>
          </div>

          <hr className="border-gray-100" />

          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">{t("common.yoloTrain")}</p>
            <TrainingPanel
              detections={allItems}
              total={total}
              hasNextPage={historyQuery.hasNextPage}
              isFetchingNextPage={historyQuery.isFetchingNextPage}
              fetchNextPage={historyQuery.fetchNextPage}
            />
          </div>
        </>
      )}
    </aside>
  );
}
