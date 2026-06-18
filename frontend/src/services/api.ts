// Using auto-imported centralized request helper

export async function detectImage(
  file: File,
  categories: string[],
  useSam2?: boolean,
  sam2ScoreThreshold?: number,
  useSam3?: boolean,
  sam3Text?: string,
  useSam3Seg?: boolean,
  sam3Threshold?: number,
  sam3MaskThreshold?: number,
  signal?: AbortSignal,
  maxBBoxArea = 1,
  minConfidence = 0,
  cropVerification = false,
  verificationVlm: "qwen3_vl" | "locate_anything" = "qwen3_vl",
): Promise<DetectResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("categories", JSON.stringify(categories));
  if (useSam3) {
    form.append("use_sam3", "true");
    if (sam3Text) form.append("sam3_text", sam3Text);
    if (useSam3Seg === false) form.append("use_sam3_seg", "false");
    if (sam3Threshold != null) form.append("sam3_threshold", String(sam3Threshold));
    if (sam3MaskThreshold != null) form.append("sam3_mask_threshold", String(sam3MaskThreshold));
  } else {
    if (useSam2) {
      form.append("use_sam2", "true");
      if (sam2ScoreThreshold != null) form.append("sam2_score_threshold", String(sam2ScoreThreshold));
    }
    form.append("max_bbox_area", String(maxBBoxArea));
    form.append("min_confidence", String(minConfidence));
    if (cropVerification) {
      form.append("crop_verification", "true");
      form.append("verification_vlm", verificationVlm);
    }
  }
  const { data } = await request.post<{ data: DetectResponse }>("/detect", form, {
    signal,
    timeout: DETECT_TIMEOUT,
  });
  return data.data;
}

export async function listDetections(
  page = 1,
  pageSize = 50,
): Promise<{ items: Detection[]; total: number }> {
  const { data } = await request.get<ListResponse<Detection>>("/detections", {
    params: { page, pageSize },
  });
  return { items: data.data, total: data.total };
}

export async function getDetection(id: string): Promise<Detection> {
  const { data } = await request.get<{ data: Detection }>(`/detections/${id}`);
  return data.data;
}

export async function deleteDetection(id: string): Promise<void> {
  await request.post(`/detections/${id}/delete`);
}

export async function deleteAllDetections(): Promise<void> {
  await request.post("/detections/delete-bulk");
}

export async function updateBox(
  detectionId: string,
  boxId: string,
  patch: { x1?: number; y1?: number; x2?: number; y2?: number; className?: string },
): Promise<void> {
  await request.put(`/detections/${detectionId}/boxes/${boxId}`, {
    x1: patch.x1,
    y1: patch.y1,
    x2: patch.x2,
    y2: patch.y2,
    className: patch.className,
  });
}

export async function deleteBox(detectionId: string, boxId: string): Promise<void> {
  await request.post(`/detections/${detectionId}/boxes/${boxId}/delete`);
}

export async function addBox(
  detectionId: string,
  box: { className: string; x1: number; y1: number; x2: number; y2: number },
): Promise<void> {
  await request.post(`/detections/${detectionId}/boxes`, box);
}

export function exportSingleUrl(id: string): string {
  return `${API_BASE}/detections/${id}/export`;
}

export async function exportBatch(
  ids: string[],
  format = "yolo",
  labelMap?: Record<string, string>,
): Promise<Blob> {
  const { data } = await request.post(
    "/detections/export-batch",
    {
      detectionIds: ids,
      format,
      ...(labelMap && Object.keys(labelMap).length > 0 ? { labelMap } : {}),
    },
    { responseType: "blob" },
  );
  return data;
}

// ── Training ────────────────────────────────────

export type YoloSeries = Record<string, { label: string; variants: Record<string, string> }>;

export async function fetchYoloSeries(): Promise<YoloSeries> {
  const { data } = await request.get<{ data: YoloSeries }>("/train/variants");
  return data.data;
}

export async function startTraining(params: {
  detectionIds: string[];
  modelVariant: string;
  epochs: number;
  imgsz: number;
  batch: number;
  trainRatio: number;
  valRatio: number;
  taskType: string;
}): Promise<TrainingJob> {
  const { data } = await request.post<{ data: TrainingJob }>("/train/jobs", params);
  return data.data;
}

export async function fetchTrainingJobs(
  page = 1,
  pageSize = 30,
): Promise<{ items: TrainingJob[]; total: number }> {
  const { data } = await request.get<ListResponse<TrainingJob>>("/train/jobs", {
    params: { page, pageSize },
  });
  return { items: data.data ?? [], total: data.total };
}

export async function cancelTrainingJob(id: string): Promise<TrainingJob> {
  const { data } = await request.post<{ data: TrainingJob }>(`/train/jobs/${id}/cancel`);
  return data.data;
}

export async function renameTrainingJob(id: string, name: string): Promise<TrainingJob> {
  const { data } = await request.post<{ data: TrainingJob }>(`/train/jobs/${id}/rename`, { name });
  return data.data;
}

export async function deleteTrainingJob(id: string): Promise<void> {
  await request.post(`/train/jobs/${id}/delete`);
}

// ── Utils ───────────────────────────────────────

export async function saveFilterSettings(
  detectionId: string,
  filterMode: string,
  filterNmsIou: number | null,
): Promise<void> {
  await request.put(`/detections/${detectionId}/filter-settings`, {
    filterMode,
    filterNmsIou,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Video ───────────────────────────────────────

export async function uploadVideo(file: File): Promise<VideoInfo> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await request.post<{ data: VideoInfo }>("/videos/upload", form, {
    timeout: UPLOAD_TIMEOUT,
  });
  return data.data;
}

export async function listVideos(
  page = 1,
  pageSize = 30,
): Promise<{ items: VideoInfo[]; total: number }> {
  const { data } = await request.get<ListResponse<VideoInfo>>("/videos", {
    params: { page, pageSize },
  });
  return { items: data.data, total: data.total };
}

export async function getVideo(id: string): Promise<VideoInfo> {
  const { data } = await request.get<{ data: VideoInfo }>(`/videos/${id}`);
  return data.data;
}

export async function extractKeyframes(
  videoId: string,
  params: {
    method: string;
    threshold?: number;
    intervalSeconds?: number;
    maxFrames?: number;
    ssimThreshold?: number;
  },
): Promise<VideoInfo> {
  const { data } = await request.post<{ data: VideoInfo }>(
    `/videos/${videoId}/extract-keyframes`,
    params,
  );
  return data.data;
}

export async function deleteVideo(id: string): Promise<void> {
  await request.post(`/videos/${id}/delete`);
}

export async function deleteAllVideos(): Promise<void> {
  await request.post("/videos/delete-bulk");
}

export function keyframeImageUrl(videoId: string, keyframeId: string): string {
  return `${API_BASE}/videos/${videoId}/keyframes/${keyframeId}/image`;
}

export function downloadModelUrl(jobId: string): string {
  return `${API_BASE}/train/jobs/${jobId}/download`;
}

export function chartUrl(jobId: string): string {
  return `${API_BASE}/train/jobs/${jobId}/charts/results.png`;
}

export function downloadOnnxUrl(jobId: string): string {
  return `${API_BASE}/train/jobs/${jobId}/export-onnx`;
}

export function downloadDatasetUrl(jobId: string): string {
  return `${API_BASE}/train/jobs/${jobId}/dataset`;
}

// ── Model ────────────────────────────────────────

export interface ModelStatus {
  loaded: boolean;
  state: "unloaded" | "downloading" | "loading" | "loaded" | "error";
  stage: string;
  progress: number;
  error: string;
}

export async function getModelStatus(): Promise<ModelStatus> {
  const { data } = await request.get<{ data: ModelStatus }>("/model/status");
  return data.data;
}

export async function unloadModel(): Promise<void> {
  await request.post("/model/unload");
}

export async function getSam2Status(): Promise<ModelStatus> {
  const { data } = await request.get<{ data: ModelStatus }>("/model/sam2/status");
  return data.data;
}

export async function unloadSam2(): Promise<void> {
  await request.post("/model/sam2/unload");
}

export interface Sam3Status {
  loaded: boolean;
  status: string; // "starting" | "loading" | "loaded" | "unloaded"
}

export async function checkSam3Health(): Promise<Sam3Status> {
  try {
    const resp = await request.get("/model/sam3/status");
    const inner = resp.data?.data;
    return {
      loaded: inner?.loaded === true,
      status: inner?.status || "unloaded",
    };
  } catch {
    return { loaded: false, status: "unloaded" };
  }
}

export async function unloadSam3(): Promise<void> {
  await request.post("/model/sam3/unload");
}

// ── Dataset Import ────────────────────────────────

export interface ImportResult {
  importId: string;
  status: string;
}

export interface ImportProgress {
  total: number;
  completed: number;
  status: string;
  detectionIds?: string[];
  error?: string | null;
}

export interface ChunkInitResult {
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number[];
}

export async function importChunkInit(
  fileName: string,
  totalSize: number,
  format: string,
): Promise<ChunkInitResult> {
  const { data } = await request.post<{ data: ChunkInitResult }>(
    "/datasets/import/chunk/init",
    { fileName, totalSize, chunkSize: 5 * 1024 * 1024, format },
  );
  return data.data;
}

export async function importChunkComplete(uploadId: string): Promise<ImportResult> {
  const { data } = await request.post<{ data: ImportResult }>(
    `/datasets/import/chunk/${uploadId}/complete`,
  );
  return data.data;
}

export async function importChunkCancel(uploadId: string): Promise<void> {
  await request.post(`/datasets/import/chunk/${uploadId}/cancel`);
}

export async function importDataset(
  file: File,
  format: string,
): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("format", format);
  const { data } = await request.post<{ data: ImportResult }>("/datasets/import", form, {
    timeout: UPLOAD_TIMEOUT,
  });
  return data.data;
}

export async function fetchImportProgress(importId: string): Promise<ImportProgress> {
  const { data } = await request.get<{ data: ImportProgress }>(
    `/datasets/import/${importId}/progress`,
  );
  return data.data;
}

export async function cancelImport(importId: string): Promise<void> {
  await request.post(`/datasets/import/${importId}/cancel`);
}

// ── Dataset Comparison ────────────────────────────

export interface CompareDataset {
  name: string;
  classes: string[];
  hasManifest: boolean;
  imageCount: number;
  trainCount: number;
  testCount: number;
}

export interface CompareImage {
  key: string;
  split: string;
  imagePath: string;
  labelPath: string;
  hasVlmPrediction: boolean;
}

export interface PrecomputeTaskStatus {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  current: number;
  total: number;
  currentImage: string;
  error: string;
}

export interface DatasetImagesResponse {
  classes: string[];
  images: CompareImage[];
  stats: {
    total: number;
    cached: number;
    progressPercent: number;
  };
  precomputeTask: PrecomputeTaskStatus;
}

export interface CompareBox {
  className: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence?: number;
}

export interface CompareAnnotationsResponse {
  humanBoxes: CompareBox[];
  vlmBoxes: CompareBox[];
  vlmCached: boolean;
  dimensions: {
    width: number;
    height: number;
  };
}

export async function fetchCompareDatasets(): Promise<CompareDataset[]> {
  const { data } = await request.get<{ data: CompareDataset[] }>("/compare/datasets");
  return data.data;
}

export async function fetchDatasetImages(
  datasetName: string,
  vlmLabels?: string[],
  maxBBoxArea = 1,
  minConfidence = 0,
): Promise<DatasetImagesResponse> {
  const params = new URLSearchParams();
  params.set("maxBBoxArea", String(maxBBoxArea));
  params.set("minConfidence", String(minConfidence));
  vlmLabels?.forEach((label) => params.append("vlmLabels", label));
  const query = params.toString();
  const { data } = await request.get<{ data: DatasetImagesResponse }>(
    `/compare/datasets/${datasetName}/images${query ? `?${query}` : ""}`,
  );
  return data.data;
}

export async function startComparePrecompute(
  datasetName: string,
  vlmLabels?: string[],
  maxBBoxArea = 1,
  minConfidence = 0,
): Promise<{ message: string; status: string; total: number }> {
  const { data } = await request.post<{
    data: { message: string; status: string; total: number };
  }>(`/compare/datasets/${datasetName}/precompute`, {
    vlmLabels: vlmLabels ?? [],
    maxBBoxArea,
    minConfidence,
  });
  return data.data;
}

export async function cancelComparePrecompute(
  datasetName: string
): Promise<{ message: string; status: string }> {
  const { data } = await request.post<{
    data: { message: string; status: string };
  }>(`/compare/datasets/${datasetName}/precompute/cancel`);
  return data.data;
}

export async function clearCompareVlmCache(
  datasetName: string,
): Promise<{ message: string; cleared: number }> {
  const { data } = await request.post<{
    data: { message: string; cleared: number };
  }>(`/compare/datasets/${datasetName}/cache/clear`);
  return data.data;
}

export interface ExportVlmDatasetResult {
  message: string;
  outputPath: string;
  outputName: string;
  exportedImages: number;
  skippedUncached: number;
  totalBoxes: number;
  classes: string[];
}

export interface CompareReportMetrics {
  tp: number;
  fp: number;
  fn: number;
  gtTotal: number;
  vlmTotal: number;
  unmappedVlm: number;
  precision: number;
  recall: number;
  f1: number;
  meanIou: number;
}

export interface CompareReportClassStat {
  className: string;
  gtCount: number;
  vlmCount: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  meanIou: number;
}

export interface CompareReportSplitStat extends CompareReportMetrics {
  split: string;
  images: number;
}

export interface CompareReportImageClassStat {
  gtCount: number;
  vlmCount: number;
  tp: number;
  fp: number;
  fn: number;
}

export interface CompareReportImageStat {
  key: string;
  split: string;
  imagePath: string;
  labelPath: string;
  tp: number;
  fp: number;
  fn: number;
  unmapped: number;
  gtCount: number;
  vlmCount: number;
  f1: number;
  meanIou: number;
  classStats: Record<string, CompareReportImageClassStat>;
}

export interface CompareReportResponse {
  dataset: string;
  vlmLabels: string[];
  maxBBoxArea: number;
  minConfidence: number;
  iouThreshold: number;
  labelMap: Record<string, string>;
  imagesEvaluated: number;
  imagesSkipped: number;
  imagesTotal: number;
  gtBoxTotal: number;
  vlmBoxTotal: number;
  unmappedVlmTotal: number;
  avgGtBoxesPerImage: number;
  avgVlmBoxesPerImage: number;
  overall: {
    global: CompareReportMetrics;
    classStats: CompareReportClassStat[];
  };
  splitStats: CompareReportSplitStat[];
  imageStats: CompareReportImageStat[];
}

export async function fetchCompareReport(
  datasetName: string,
  options: {
    iouThreshold?: number;
    vlmLabels?: string[];
    maxBBoxArea?: number;
    minConfidence?: number;
    labelMap?: Record<string, string>;
  } = {},
): Promise<CompareReportResponse> {
  const params = new URLSearchParams();
  params.set("iouThreshold", String(options.iouThreshold ?? 0.5));
  params.set("maxBBoxArea", String(options.maxBBoxArea ?? 1));
  params.set("minConfidence", String(options.minConfidence ?? 0));
  options.vlmLabels?.forEach((label) => params.append("vlmLabels", label));
  if (options.labelMap && Object.keys(options.labelMap).length > 0) {
    params.set("labelMap", JSON.stringify(options.labelMap));
  }
  const { data } = await request.get<{ data: CompareReportResponse }>(
    `/compare/datasets/${datasetName}/report?${params.toString()}`,
    { timeout: REPORT_TIMEOUT },
  );
  return data.data;
}

export async function exportCompareVlmDataset(
  datasetName: string,
  payload: {
    outputName: string;
    vlmLabels?: string[];
    maxBBoxArea?: number;
    minConfidence?: number;
    labelMap?: Record<string, string>;
  },
): Promise<ExportVlmDatasetResult> {
  const { data } = await request.post<{ data: ExportVlmDatasetResult }>(
    `/compare/datasets/${datasetName}/export`,
    {
      outputName: payload.outputName,
      vlmLabels: payload.vlmLabels ?? [],
      maxBBoxArea: payload.maxBBoxArea ?? 1,
      minConfidence: payload.minConfidence ?? 0,
      labelMap: payload.labelMap ?? {},
    },
  );
  return data.data;
}

export async function fetchAnnotations(
  dataset: string,
  imagePath: string,
  labelPath: string,
  runVLM = false,
  vlmLabels?: string[],
  maxBBoxArea = 1,
  minConfidence = 0,
): Promise<CompareAnnotationsResponse> {
  const params = new URLSearchParams({
    dataset,
    imagePath,
    labelPath,
    runVLM: String(runVLM),
    maxBBoxArea: String(maxBBoxArea),
    minConfidence: String(minConfidence),
  });
  vlmLabels?.forEach((label) => params.append("vlmLabels", label));
  const { data } = await request.get<{ data: CompareAnnotationsResponse }>(
    `/compare/annotations?${params.toString()}`,
  );
  return data.data;
}

export function compareImageUrl(dataset: string, imagePath: string): string {
  return `${API_BASE}/compare/image?dataset=${encodeURIComponent(
    dataset
  )}&imagePath=${encodeURIComponent(imagePath)}`;
}

