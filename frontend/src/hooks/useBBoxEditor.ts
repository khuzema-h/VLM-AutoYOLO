import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { addBox, deleteBox, updateBox } from "@/services/api";
import type { BBox } from "@/types";

function patchDetectionBoxes(
  boxId: string,
  patch: Partial<BBox>,
  detection: import("@/types").Detection,
): import("@/types").Detection {
  return {
    ...detection,
    boxes: detection.boxes.map((b) => (b.id === boxId ? { ...b, ...patch } : b)),
  };
}

export function useBBoxEditor() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { drawCategory, result, setResult, setBatchResults } = useAppStore();
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const syncDetection = useCallback(
    (updated: import("@/types").Detection) => {
      setResult(updated);
      setBatchResults((prev) => prev.map((r) => (r?.id === updated.id ? updated : r)));
      queryClient.invalidateQueries({ queryKey: ["detections"] });
    },
    [setBatchResults, setResult, queryClient],
  );

  const handleUpdateBoxCoords = useCallback(
    async (boxId: string, coords: { x1: number; y1: number; x2: number; y2: number }) => {
      if (!result) return;
      const updated = patchDetectionBoxes(boxId, coords, result);
      syncDetection(updated);
      try {
        await updateBox(result.id, boxId, coords);
      } catch (e) {
        console.error("Update box failed:", e);
        toast.error(t("bboxEditor.updateFailed"));
        setResult(result);
        setBatchResults((prev) => prev.map((r) => (r?.id === result.id ? result : r)));
      }
    },
    [result, syncDetection, setBatchResults, setResult, t],
  );

  const handleClassChange = useCallback(
    async (boxId: string, className: string) => {
      if (!result) return;
      const trimmed = className.trim();
      if (!trimmed) return;
      const updated = patchDetectionBoxes(boxId, { className: trimmed }, result);
      syncDetection(updated);
      try {
        await updateBox(result.id, boxId, { className: trimmed });
      } catch (e) {
        console.error("Update class failed:", e);
        toast.error(t("bboxEditor.updateFailed"));
        setResult(result);
        setBatchResults((prev) => prev.map((r) => (r?.id === result.id ? result : r)));
      }
    },
    [result, syncDetection, setBatchResults, setResult, t],
  );

  const handleDrawBox = useCallback(
    async (raw: { x1: number; y1: number; x2: number; y2: number }) => {
      if (!result || !drawCategory.trim()) {
        toast.error(t("home.drawCategoryRequired"));
        return;
      }
      try {
        await addBox(result.id, { ...raw, className: drawCategory.trim() });
        const newBox: BBox = {
          id: `manual-${Date.now()}`,
          className: drawCategory.trim(),
          ...raw,
          confidence: null,
        };
        const updated = { ...result, boxes: [...result.boxes, newBox] };
        syncDetection(updated);
        setSelectedBoxId(newBox.id);
      } catch (e) {
        console.error("Draw box failed:", e);
        toast.error(t("home.drawBoxFailed"));
      }
    },
    [result, drawCategory, syncDetection, t],
  );

  const handleDeleteBox = useCallback(
    async (boxId: string) => {
      if (!result) return;
      const box = result.boxes.find((b) => b.id === boxId);
      if (!box) return;
      try {
        await deleteBox(result.id, box.id);
        const updated = { ...result, boxes: result.boxes.filter((b) => b.id !== boxId) };
        syncDetection(updated);
        if (selectedBoxId === boxId) setSelectedBoxId(null);
      } catch (e) {
        console.error("Delete box failed:", e);
        toast.error(t("home.deleteBoxFailed"));
      }
    },
    [result, selectedBoxId, syncDetection, t],
  );

  return {
    selectedBoxId,
    setSelectedBoxId,
    handleUpdateBoxCoords,
    handleClassChange,
    handleDrawBox,
    handleDeleteBox,
  };
}
