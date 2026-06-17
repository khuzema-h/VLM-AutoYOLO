import toast from "react-hot-toast";

const PROGRESS_UPDATE_EVERY = 10;

export function useBatchDetection() {
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const batchRef = useRef(false);

  const runBatch = useCallback(
    async (
      files: File[],
      categories: string[],
      useSam2: boolean,
      sam2ScoreThreshold: number,
      useSam3: boolean,
      sam3Text: string,
      useSam3Seg: boolean,
      sam3Threshold: number,
      sam3MaskThreshold: number,
      maxBBoxArea: number,
      minConfidence: number,
      cropVerification: boolean,
      verificationVlm: "qwen3_vl" | "locate_anything",
      onEach: (result: Detection, file: File, index: number, elapsed: number) => void,
      signal?: AbortSignal,
    ) => {
      const results: Detection[] = [];
      setBatchProgress({ current: 0, total: files.length });
      batchRef.current = true;
      const t0 = performance.now();
      let elapsed = 0;

      const updateProgress = (index: number) => {
        if (index >= files.length - 1) {
          setBatchProgress({ current: 0, total: 0 });
          return;
        }
        const next = index + 1;
        if (files.length <= PROGRESS_UPDATE_EVERY || next % PROGRESS_UPDATE_EVERY === 0) {
          setBatchProgress({ current: next, total: files.length });
        }
      };

      for (let i = 0; i < files.length; i++) {
        if (!batchRef.current || signal?.aborted) break;
        try {
          const data = await detectImage(
            files[i],
            categories,
            useSam2,
            sam2ScoreThreshold,
            useSam3,
            sam3Text,
            useSam3Seg,
            sam3Threshold,
            sam3MaskThreshold,
            signal,
            maxBBoxArea,
            minConfidence,
            cropVerification,
            verificationVlm,
          );
          results.push(data);
          updateProgress(i);
          elapsed = Math.round(performance.now() - t0);
          onEach(data, files[i], i, elapsed);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") break;
          console.error(`Batch detection failed on ${files[i]?.name}:`, e);
          toast.error(`Detection failed: ${files[i]?.name ?? `image ${i + 1}`}`);
          updateProgress(i);
        }
      }
      setBatchProgress({ current: 0, total: 0 });
      return { results, elapsed };
    },
    [],
  );

  const cancelBatch = useCallback(() => {
    batchRef.current = false;
    setBatchProgress({ current: 0, total: 0 });
  }, []);

  return { batchProgress, runBatch, cancelBatch, setBatchProgress };
}
