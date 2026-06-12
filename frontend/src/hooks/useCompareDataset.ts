import { useState, useEffect, useRef, useCallback } from "react";
import { message } from "antd";
import { useAppStore } from "@/store/useAppStore";
import { mergeLabelMap } from "@/lib/compareLabelMap";
import {
  fetchCompareDatasets,
  fetchDatasetImages,
  startComparePrecompute,
  cancelComparePrecompute,
  clearCompareVlmCache,
  exportCompareVlmDataset,
  type CompareDataset,
  type CompareImage,
  type PrecomputeTaskStatus,
} from "@/services/api";

export function useCompareDataset() {
  const { t } = useTranslation();
  const {
    compareDataset,
    setCompareDataset,
    compareImage,
    setCompareImage,
    compareVlmLabels,
    setCompareVlmLabels,
    compareMaxBBoxArea,
    setCompareMaxBBoxArea,
    compareMinConfidence,
    setCompareMinConfidence,
    compareLabelMap,
    setCompareLabelMap,
    setCompareGtClasses,
  } = useAppStore();

  const [datasets, setDatasets] = useState<CompareDataset[]>([]);
  const [images, setImages] = useState<CompareImage[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    cached: number;
    progressPercent: number;
  } | null>(null);
  const [taskStatus, setTaskStatus] = useState<PrecomputeTaskStatus | null>(null);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [splitFilter, setSplitFilter] = useState<"all" | "train" | "test">("all");
  const [cacheFilter, setCacheFilter] = useState<"all" | "cached" | "not_cached">("all");
  const [exportOutputName, setExportOutputName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [compareTab, setCompareTab] = useState<"image" | "report">("image");

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadImages = useCallback(
    async (
      datasetName: string,
      options: {
        silent?: boolean;
        vlmLabels?: string[];
        maxBBoxArea?: number;
        minConfidence?: number;
        initLabelsFromDataset?: boolean;
      } = {},
    ) => {
      const { silent = false, vlmLabels, initLabelsFromDataset = false } = options;
      const activeLabels = vlmLabels ?? useAppStore.getState().compareVlmLabels;
      const maxBBoxArea =
        options.maxBBoxArea ?? useAppStore.getState().compareMaxBBoxArea;
      const minConfidence =
        options.minConfidence ?? useAppStore.getState().compareMinConfidence;

      if (!silent) setLoadingImages(true);
      try {
        const data = await fetchDatasetImages(
          datasetName,
          activeLabels.length > 0 ? activeLabels : undefined,
          maxBBoxArea,
          minConfidence,
        );
        setImages(data.images);
        setClasses(data.classes);
        setCompareGtClasses(data.classes);

        // Only seed labels from dataset on initial dataset selection — never after user edits.
        if (
          initLabelsFromDataset &&
          data.classes.length > 0 &&
          useAppStore.getState().compareVlmLabels.length === 0
        ) {
          setCompareVlmLabels(data.classes);
          setCompareLabelMap(mergeLabelMap({}, data.classes, data.classes));
        }

        setStats(data.stats);
        setTaskStatus(data.precomputeTask);

        const currentImage = useAppStore.getState().compareImage;
        if (currentImage) {
          const updated = data.images.find((img) => img.key === currentImage.key);
          if (updated) setCompareImage(updated);
        } else if (!silent && data.images.length > 0) {
          setCompareImage(data.images[0]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!silent) message.error("Failed to load images: " + msg);
      } finally {
        if (!silent) setLoadingImages(false);
      }
    },
    [setCompareGtClasses, setCompareImage, setCompareLabelMap, setCompareVlmLabels],
  );

  useEffect(() => {
    async function loadDatasets() {
      setLoadingDatasets(true);
      try {
        const data = await fetchCompareDatasets();
        setDatasets(data);
        if (data.length > 0 && !useAppStore.getState().compareDataset) {
          setCompareDataset(data[0].name);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error("Failed to load datasets: " + msg);
      } finally {
        setLoadingDatasets(false);
      }
    }
    loadDatasets();
  }, [setCompareDataset]);

  useEffect(() => {
    if (compareDataset) {
      setExportOutputName(`${compareDataset}_vlm`);
      setCompareVlmLabels([]);
      setCompareLabelMap({});
      loadImages(compareDataset, { initLabelsFromDataset: true, vlmLabels: [] });
    } else {
      setImages([]);
      setStats(null);
      setTaskStatus(null);
      setCompareImage(null);
      setCompareVlmLabels([]);
      setCompareGtClasses([]);
      setCompareLabelMap({});
    }
  }, [compareDataset]);

  const handleVlmLabelsChange = (labels: string[]) => {
    setCompareVlmLabels(labels);
    setCompareLabelMap(mergeLabelMap(compareLabelMap, labels, classes));
    if (compareDataset) {
      loadImages(compareDataset, { silent: true, vlmLabels: labels });
    }
  };

  const handleMaxBBoxAreaChange = (ratio: number) => {
    setCompareMaxBBoxArea(ratio);
    if (compareDataset) {
      loadImages(compareDataset, { silent: true, maxBBoxArea: ratio });
    }
  };

  const handleMinConfidenceChange = (conf: number) => {
    setCompareMinConfidence(conf);
    if (compareDataset) {
      loadImages(compareDataset, { silent: true, minConfidence: conf });
    }
  };

  useEffect(() => {
    if (taskStatus?.status === "running" && compareDataset) {
      pollTimerRef.current = setTimeout(() => {
        loadImages(compareDataset, { silent: true });
      }, 2000);
    } else if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [taskStatus, compareDataset, loadImages]);

  useEffect(() => {
    const ready =
      stats &&
      stats.cached === stats.total &&
      stats.total > 0 &&
      taskStatus?.status !== "running";
    if (taskStatus?.status === "completed" && ready) {
      setCompareTab("report");
    }
  }, [taskStatus?.status, stats]);

  const handleStartPrecompute = async () => {
    if (!compareDataset || compareVlmLabels.length === 0) return;
    const { compareMaxBBoxArea: maxBBoxArea, compareMinConfidence: minConfidence } =
      useAppStore.getState();
    try {
      const res = await startComparePrecompute(
        compareDataset,
        compareVlmLabels,
        maxBBoxArea,
        minConfidence,
      );
      message.success(res.message || "Precompute started successfully");
      loadImages(compareDataset, { silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error("Failed to start precomputation: " + msg);
    }
  };

  const handleCancelPrecompute = async () => {
    if (!compareDataset) return;
    try {
      const res = await cancelComparePrecompute(compareDataset);
      message.success(res.message || "Cancellation request sent");
      loadImages(compareDataset, { silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error("Failed to cancel precomputation: " + msg);
    }
  };

  const handleClearVlmCache = async () => {
    if (!compareDataset) return;
    try {
      const res = await clearCompareVlmCache(compareDataset);
      message.success(t("compare.clearCacheSuccess", { count: res.cleared }));
      loadImages(compareDataset, { silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(t("compare.clearCacheFailed") + ": " + msg);
    }
  };

  const handleExportVlmDataset = async (outputNameOverride?: string) => {
    const outputName = (outputNameOverride ?? exportOutputName).trim();
    if (!compareDataset || !outputName || compareVlmLabels.length === 0) return;
    const { compareMaxBBoxArea: maxBBoxArea, compareMinConfidence: minConfidence } =
      useAppStore.getState();
    const labelMap = Object.fromEntries(
      Object.entries(compareLabelMap).filter(([, gt]) => Boolean(gt)),
    );
    setExporting(true);
    try {
      const res = await exportCompareVlmDataset(compareDataset, {
        outputName,
        vlmLabels: compareVlmLabels,
        maxBBoxArea,
        minConfidence,
        labelMap,
      });
      message.success(
        t("compare.exportSuccess", {
          name: res.outputName,
          images: res.exportedImages,
          boxes: res.totalBoxes,
        }),
      );
      const data = await fetchCompareDatasets();
      setDatasets(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(t("compare.exportFailed") + ": " + msg);
    } finally {
      setExporting(false);
    }
  };

  const filteredImages = images.filter((img) => {
    const matchesSearch = img.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSplit = splitFilter === "all" || img.split === splitFilter;
    const matchesCache =
      cacheFilter === "all" ||
      (cacheFilter === "cached" && img.hasVlmPrediction) ||
      (cacheFilter === "not_cached" && !img.hasVlmPrediction);
    return matchesSearch && matchesSplit && matchesCache;
  });

  const activeDatasetObj = datasets.find((d) => d.name === compareDataset);

  const investigateImageByKey = useCallback(
    (key: string) => {
      const img = images.find((item) => item.key === key);
      if (img) {
        setCompareImage(img);
        setCompareTab("image");
      }
    },
    [images, setCompareImage],
  );

  return {
    compareDataset,
    setCompareDataset,
    compareImage,
    setCompareImage,
    compareVlmLabels,
    compareMaxBBoxArea,
    compareMinConfidence,
    compareLabelMap,
    setCompareLabelMap,
    datasets,
    classes,
    stats,
    taskStatus,
    loadingDatasets,
    loadingImages,
    searchQuery,
    setSearchQuery,
    splitFilter,
    setSplitFilter,
    cacheFilter,
    setCacheFilter,
    filteredImages,
    activeDatasetObj,
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
    compareTab,
    setCompareTab,
    investigateImageByKey,
  };
}

export type CompareDatasetContextValue = ReturnType<typeof useCompareDataset>;
