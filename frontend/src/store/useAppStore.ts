import { create } from "zustand";
import type { CompareLabelMap } from "@/lib/compareLabelMap";
import type { ReviewLabelMap } from "@/lib/reviewLabelMap";
import type { FilterMode } from "@/lib/filterBoxes";
import {
  DEFAULT_RGB_THRESHOLD,
  type RgbThresholdSettings,
} from "@/lib/rgbThreshold";

interface AppState {
  // Model Config
  appMode: "annotate" | "validate" | "compare" | "review";
  setAppMode: (mode: "annotate" | "validate" | "compare" | "review") => void;
  annotateSubTab: "detect" | "preprocess";
  setAnnotateSubTab: (tab: "detect" | "preprocess") => void;
  useSam2: boolean;
  setUseSam2: (v: boolean) => void;
  useSam3: boolean;
  setUseSam3: (v: boolean) => void;
  useSam3Seg: boolean;
  setUseSam3Seg: (v: boolean) => void;
  sam3Threshold: number;
  setSam3Threshold: (v: number) => void;
  sam3MaskThreshold: number;
  setSam3MaskThreshold: (v: number) => void;
  sam2ScoreThreshold: number;
  setSam2ScoreThreshold: (v: number) => void;
  sam3Text: string;
  setSam3Text: (v: string) => void;

  // Upload State
  inputMode: "image" | "video";
  setInputMode: (mode: "image" | "video") => void;
  files: File[];
  setFiles: (files: File[]) => void;
  originalFiles: File[];
  setOriginalFiles: (files: File[]) => void;
  preprocessRgb: RgbThresholdSettings;
  setPreprocessRgb: (settings: RgbThresholdSettings) => void;
  preprocessApplied: boolean;
  setPreprocessApplied: (applied: boolean) => void;
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  categories: string[];
  setCategories: (categories: string[]) => void;

  // Annotation State
  canvasMode: "view" | "draw";
  setCanvasMode: (mode: "view" | "draw") => void;
  drawCategory: string;
  setDrawCategory: (cat: string) => void;
  hiddenIndices: Set<string>;
  setHiddenIndices: (indices: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  nmsIou: number;
  setNmsIou: (iou: number) => void;

  // Yolo Validation State
  validateModelSource: "trained" | "upload";
  setValidateModelSource: (source: "trained" | "upload") => void;
  selectedTrainedJobId: string | null;
  setSelectedTrainedJobId: (id: string | null) => void;
  validateVideoId: string | null;
  setValidateVideoId: (id: string | null) => void;
  validateRunKey: number;
  setValidateRunKey: (key: number | ((prev: number) => number)) => void;
  externalModelFile: File | null;
  setExternalModelFile: (file: File | null) => void;
  validateConf: number;
  setValidateConf: (conf: number) => void;
  validateIou: number;
  setValidateIou: (iou: number) => void;

  // Shared Detection State
  result: import("@/types").Detection | null;
  setResult: (result: import("@/types").Detection | null) => void;
  batchResults: import("@/types").Detection[];
  setBatchResults: (results: import("@/types").Detection[] | ((prev: import("@/types").Detection[]) => import("@/types").Detection[])) => void;

  // Training State
  isTraining: boolean;
  setIsTraining: (v: boolean) => void;

  // Compare State
  compareDataset: string | null;
  setCompareDataset: (dataset: string | null) => void;
  compareImage: any | null;
  setCompareImage: (image: any | null) => void;
  compareVlmLabels: string[];
  setCompareVlmLabels: (labels: string[]) => void;
  compareGtClasses: string[];
  setCompareGtClasses: (classes: string[]) => void;
  compareLabelMap: CompareLabelMap;
  setCompareLabelMap: (map: CompareLabelMap) => void;
  compareMaxBBoxArea: number;
  setCompareMaxBBoxArea: (ratio: number) => void;
  compareMinConfidence: number;
  setCompareMinConfidence: (conf: number) => void;
  cropVerification: boolean;
  setCropVerification: (enabled: boolean) => void;
  verificationVlm: "qwen3_vl" | "locate_anything";
  setVerificationVlm: (backend: "qwen3_vl" | "locate_anything") => void;

  // Review export label renaming
  reviewLabelMap: ReviewLabelMap;
  setReviewLabelMap: (map: ReviewLabelMap) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Model Config
  appMode: "annotate",
  setAppMode: (mode) => set({ appMode: mode }),
  annotateSubTab: "detect",
  setAnnotateSubTab: (annotateSubTab) => set({ annotateSubTab }),
  useSam2: false,
  setUseSam2: (useSam2) => set({ useSam2 }),
  useSam3: false,
  setUseSam3: (useSam3) => set({ useSam3 }),
  useSam3Seg: true,
  setUseSam3Seg: (useSam3Seg) => set({ useSam3Seg }),
  sam3Threshold: 0.5,
  setSam3Threshold: (sam3Threshold) => set({ sam3Threshold }),
  sam3MaskThreshold: 0.5,
  setSam3MaskThreshold: (sam3MaskThreshold) => set({ sam3MaskThreshold }),
  sam2ScoreThreshold: 0.0,
  setSam2ScoreThreshold: (sam2ScoreThreshold) => set({ sam2ScoreThreshold }),
  sam3Text: "",
  setSam3Text: (sam3Text) => set({ sam3Text }),

  // Upload State
  inputMode: "image",
  setInputMode: (inputMode) => set({ inputMode }),
  files: [],
  setFiles: (files) => set({ files }),
  originalFiles: [],
  setOriginalFiles: (originalFiles) => set({ originalFiles }),
  preprocessRgb: (() => {
    try {
      const saved = localStorage.getItem("preprocess_rgb");
      if (saved) {
        const parsed = JSON.parse(saved) as RgbThresholdSettings;
        if (
          parsed?.r?.length === 2 &&
          parsed?.g?.length === 2 &&
          parsed?.b?.length === 2 &&
          (parsed.background === "black" || parsed.background === "white")
        ) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_RGB_THRESHOLD;
  })(),
  setPreprocessRgb: (preprocessRgb) => {
    localStorage.setItem("preprocess_rgb", JSON.stringify(preprocessRgb));
    set({ preprocessRgb });
  },
  preprocessApplied: false,
  setPreprocessApplied: (preprocessApplied) => set({ preprocessApplied }),
  previewUrl: null,
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  categories: [],
  setCategories: (categories) => set({ categories }),

  // Annotation State
  canvasMode: "view",
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  drawCategory: "",
  setDrawCategory: (drawCategory) => set({ drawCategory }),
  hiddenIndices: new Set(),
  setHiddenIndices: (updater) =>
    set((state) => ({
      hiddenIndices: typeof updater === "function" ? updater(state.hiddenIndices) : updater,
    })),
  filterMode: "all",
  setFilterMode: (filterMode) => set({ filterMode }),
  nmsIou: 0.5,
  setNmsIou: (nmsIou) => set({ nmsIou }),

  // Yolo Validation State
  validateModelSource: "trained",
  setValidateModelSource: (validateModelSource) => set({ validateModelSource }),
  selectedTrainedJobId: null,
  setSelectedTrainedJobId: (selectedTrainedJobId) => set({ selectedTrainedJobId }),
  validateVideoId: null,
  setValidateVideoId: (validateVideoId) => set({ validateVideoId }),
  validateRunKey: 0,
  setValidateRunKey: (updater) =>
    set((state) => ({
      validateRunKey: typeof updater === "function" ? updater(state.validateRunKey) : updater,
    })),
  externalModelFile: null,
  setExternalModelFile: (externalModelFile) => set({ externalModelFile }),
  validateConf: 0.25,
  setValidateConf: (validateConf) => set({ validateConf }),
  validateIou: 0.7,
  setValidateIou: (validateIou) => set({ validateIou }),

  // Shared Detection State
  result: null,
  setResult: (result) => set({ result }),
  batchResults: [],
  setBatchResults: (updater) =>
    set((state) => ({
      batchResults: typeof updater === "function" ? updater(state.batchResults) : updater,
    })),

  // Training State
  isTraining: false,
  setIsTraining: (isTraining) => set({ isTraining }),

  // Compare State
  compareDataset: null,
  setCompareDataset: (dataset) => set({ compareDataset: dataset }),
  compareImage: null,
  setCompareImage: (image) => set({ compareImage: image }),
  compareVlmLabels: [],
  setCompareVlmLabels: (compareVlmLabels) => set({ compareVlmLabels }),
  compareGtClasses: [],
  setCompareGtClasses: (compareGtClasses) => set({ compareGtClasses }),
  compareLabelMap: {},
  setCompareLabelMap: (compareLabelMap) => set({ compareLabelMap }),
  compareMaxBBoxArea: (() => {
    const saved = localStorage.getItem("compare_max_bbox_area");
    if (saved) {
      const v = parseFloat(saved);
      if (!Number.isNaN(v) && v >= 0.05 && v <= 1) return v;
    }
    return 1;
  })(),
  setCompareMaxBBoxArea: (compareMaxBBoxArea) => {
    localStorage.setItem("compare_max_bbox_area", String(compareMaxBBoxArea));
    set({ compareMaxBBoxArea });
  },
  compareMinConfidence: (() => {
    const saved = localStorage.getItem("compare_min_confidence");
    if (saved) {
      const v = parseFloat(saved);
      if (!Number.isNaN(v) && v >= 0 && v <= 1) return v;
    }
    return 0;
  })(),
  setCompareMinConfidence: (compareMinConfidence) => {
    localStorage.setItem("compare_min_confidence", String(compareMinConfidence));
    set({ compareMinConfidence });
  },

  cropVerification: localStorage.getItem("crop_verification") === "true",
  setCropVerification: (cropVerification) => {
    localStorage.setItem("crop_verification", String(cropVerification));
    set({ cropVerification });
  },
  verificationVlm: (() => {
    const saved = localStorage.getItem("verification_vlm");
    return saved === "locate_anything" ? "locate_anything" : "qwen3_vl";
  })(),
  setVerificationVlm: (verificationVlm) => {
    localStorage.setItem("verification_vlm", verificationVlm);
    set({ verificationVlm });
  },

  reviewLabelMap: {},
  setReviewLabelMap: (reviewLabelMap) => set({ reviewLabelMap }),
}));
