import { useCallback } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { getDetection } from "@/services/api";
import { batchFileMap, getFileUrl } from "@/lib/cache";
import { API_BASE } from "@/lib/constants";
import type { Detection } from "@/types";

export function useReviewSelection() {
  const queryClient = useQueryClient();
  const { setResult, setPreviewUrl, setBatchResults } = useAppStore();

  const selectForReview = useCallback(
    async (det: Detection, file?: File) => {
      try {
        const full = await getDetection(det.id);
        setResult(full);
        setBatchResults((prev) => {
          const idx = prev.findIndex((r) => r?.id === full.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = full;
            return next;
          }
          return prev;
        });
        const cachedFile = file ?? batchFileMap.get(full.id);
        setPreviewUrl(
          cachedFile ? getFileUrl(cachedFile) : `${API_BASE}/detections/${full.id}/image`,
        );
      } catch (e) {
        console.error("Failed to load detection for review:", e);
        toast.error("Failed to load image");
      }
    },
    [setBatchResults, setPreviewUrl, setResult],
  );

  const invalidateHistory = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["detections"] });
  }, [queryClient]);

  return { selectForReview, invalidateHistory };
}
