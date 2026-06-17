import { useEffect, useMemo } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/Sidebar";
import { VideoValidator } from "@/components/VideoValidator";
import { DetectionResult } from "@/components/DetectionResult";
import { CompareMain } from "@/components/Compare/CompareMain";
import { CompareProvider } from "@/components/Compare/CompareContext";
import { CompareImageList } from "@/components/Compare/CompareImageList";
import { ReviewImageList } from "@/components/BBoxEditor/ReviewImageList";
import { BBoxEditorMain } from "@/components/BBoxEditor/BBoxEditorMain";
import { PreprocessPreview } from "@/components/Preprocess/PreprocessPreview";
import { useReviewSelection } from "@/hooks/useReviewSelection";
import { batchFileMap } from "@/lib/cache";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/useAppStore";
import { useDetectionProcess } from "@/hooks/useDetectionProcess";
import { useDetectionHistory } from "@/hooks/useDetectionHistory";
import { useDetectionAnnotation } from "@/hooks/useDetectionAnnotation";

export function Home() {
  const { t } = useTranslation();
  const {
    appMode,
    annotateSubTab,
    validateModelSource,
    selectedTrainedJobId,
    externalModelFile,
    validateConf,
    validateIou,
    validateVideoId,
    validateRunKey,
    previewUrl,
    setPreviewUrl,
    files,
    categories,
    canvasMode,
    drawCategory,
    hiddenIndices,
    setCanvasMode,
    setDrawCategory,
    result,
    setResult,
    batchResults,
  } = useAppStore();

  const {
    elapsedMs,
    batchProgress,
    handleFiles,
    handleSelectKeyframe,
    handleBatchSelect,
    handleDetect,
    handleReDetect,
    cancel,
    loading,
    filesProcessing,
    setFilesProcessing,
    isRedetecting,
  } = useDetectionProcess();

  const { historyQuery, allItems, total, recentCategories, handleSelectHistory } = useDetectionHistory();
  const { selectForReview } = useReviewSelection();

  const reviewItems = useMemo(
    () => buildReviewItems(allItems, batchResults, result),
    [allItems, batchResults, result],
  );

  const {
    handleDrawBox,
    handleDeleteBox,
    handleSaveBoxes,
    toggleBoxVisibility,
    displayResult,
  } = useDetectionAnnotation();

  // Keyboard navigation for batch results
  useEffect(() => {
    if (batchResults.length <= 1) return;
    const handler = (e: KeyboardEvent) => {
      const idx = result ? batchResults.findIndex((r) => r.id === result.id) : -1;
      if (e.key === "ArrowLeft" && idx > 0) {
        handleBatchSelect(batchResults[idx - 1], files[idx - 1]);
      } else if (e.key === "ArrowRight" && idx < batchResults.length - 1) {
        handleBatchSelect(batchResults[idx + 1], files[idx + 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [batchResults, result, files, handleBatchSelect]);

  const sidebarProps = {
    recentCategories,
    handleFiles,
    handleDetect,
    handleSelectHistory,
    loading,
    batchProgress,
    batchResults,
    cancel,
    historyQuery: {
      hasNextPage: historyQuery.hasNextPage ?? false,
      isFetchingNextPage: historyQuery.isFetchingNextPage,
      fetchNextPage: () => historyQuery.fetchNextPage(),
    } as const,
    allItems,
    total,
    result,
    setResult,
    handleSelectKeyframe,
    filesProcessing,
    setFilesProcessing,
    reviewItems,
  };

  return (
    <>
      {appMode === "compare" ? (
        <CompareProvider>
          <Sidebar {...sidebarProps} />
          <CompareImageList />
          <main className="flex-1 flex flex-col overflow-y-auto p-6 min-w-0 min-h-0">
            <CompareMain />
          </main>
        </CompareProvider>
      ) : appMode === "review" ? (
        <>
          <Sidebar {...sidebarProps} />
          <ReviewImageList
            items={reviewItems}
            activeId={result?.id ?? null}
            total={total}
            loadedCount={allItems.length}
            hasNextPage={historyQuery.hasNextPage ?? false}
            isFetchingNextPage={historyQuery.isFetchingNextPage}
            fetchNextPage={() => historyQuery.fetchNextPage()}
            onSelect={(det) => {
              const idx = reviewItems.findIndex((d) => d.id === det.id);
              const file = batchFileMap.get(det.id) ?? files[idx];
              void selectForReview(det, file);
            }}
          />
          <main className="flex-1 flex flex-col overflow-y-auto p-6 min-w-0 min-h-0">
            <BBoxEditorMain
              items={reviewItems}
              files={files}
              categories={categories}
              recentCategories={recentCategories}
              hiddenIndices={hiddenIndices}
              onToggleVisibility={toggleBoxVisibility}
              onSelectImage={selectForReview}
            />
          </main>
        </>
      ) : (
        <>
          <Sidebar {...sidebarProps} />
          <main className="flex-1 flex flex-col overflow-y-auto p-6">
            {validateVideoId && appMode === "validate" && (
              <VideoValidator
                key={validateRunKey}
                videoId={validateVideoId}
                jobId={
                  validateModelSource === "trained" ? (selectedTrainedJobId ?? undefined) : undefined
                }
                modelFile={
                  validateModelSource === "upload" ? (externalModelFile ?? undefined) : undefined
                }
                conf={validateConf}
                iou={validateIou}
              />
            )}

            {!validateVideoId &&
              !displayResult &&
              !previewUrl &&
              !(appMode === "annotate" && annotateSubTab === "preprocess") && (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                {t("home.placeholderDefault")}
              </div>
            )}

            {appMode === "annotate" && annotateSubTab === "preprocess" && !validateVideoId && (
              <PreprocessPreview />
            )}

            {previewUrl && !validateVideoId && !(appMode === "annotate" && annotateSubTab === "preprocess") && (
              <ErrorBoundary>
                <DetectionResult
                  result={displayResult}
                  previewUrl={previewUrl}
                  batchResults={batchResults}
                  batchFiles={files}
                  loading={loading}
                  elapsedMs={elapsedMs}
                  categories={categories}
                  canvasMode={canvasMode}
                  drawCategory={drawCategory}
                  recentCategories={recentCategories}
                  hiddenIndices={hiddenIndices}
                  onToggleVisibility={toggleBoxVisibility}
                  isValidation={appMode === "validate"}
                  onCanvasModeChange={setCanvasMode}
                  onDrawCategoryChange={setDrawCategory}
                  onDeleteBox={handleDeleteBox}
                  onSelectBatch={handleBatchSelect}
                  onSelectPending={(url) => {
                    setPreviewUrl(url);
                    setResult(null);
                  }}
                  onReDetect={handleReDetect}
                  onSaveBoxes={handleSaveBoxes}
                  onDrawBox={handleDrawBox}
                  isRedetecting={isRedetecting}
                />
              </ErrorBoundary>
            )}
          </main>
        </>
      )}
    </>
  );
}
