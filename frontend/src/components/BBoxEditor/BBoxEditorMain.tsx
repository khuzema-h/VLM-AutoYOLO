import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/useAppStore";
import { BBoxEditorCanvas } from "./BBoxEditorCanvas";
import { useBBoxEditor } from "@/hooks/useBBoxEditor";
import { batchFileMap, getFileUrl } from "@/lib/cache";
import { API_BASE } from "@/lib/constants";
import type { Detection } from "@/types";

interface Props {
  items: Detection[];
  files: File[];
  categories: string[];
  recentCategories: string[];
  hiddenIndices: Set<string>;
  onToggleVisibility: (boxId: string) => void;
  onSelectImage: (det: Detection, file?: File) => void;
}

export function BBoxEditorMain({
  items,
  files,
  categories,
  recentCategories,
  hiddenIndices,
  onToggleVisibility,
  onSelectImage,
}: Props) {
  const { t } = useTranslation();
  const { result, drawCategory, setDrawCategory } = useAppStore();
  const [editorMode, setEditorMode] = useState<"select" | "draw">("select");

  const {
    selectedBoxId,
    setSelectedBoxId,
    handleUpdateBoxCoords,
    handleClassChange,
    handleDrawBox,
    handleDeleteBox,
  } = useBBoxEditor();

  const currentIndex = result ? items.findIndex((d) => d.id === result.id) : -1;
  const previewUrl = useMemo(() => {
    if (!result) return "";
    const file = batchFileMap.get(result.id) ?? files[currentIndex];
    if (file) return getFileUrl(file);
    return `${API_BASE}/detections/${result.id}/image`;
  }, [result, files, currentIndex]);

  const goTo = useCallback(
    (offset: number) => {
      if (currentIndex < 0) return;
      const next = currentIndex + offset;
      if (next < 0 || next >= items.length) return;
      const det = items[next];
      const file = batchFileMap.get(det.id) ?? files[next];
      setSelectedBoxId(null);
      onSelectImage(det, file);
    },
    [currentIndex, items, files, onSelectImage, setSelectedBoxId],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") goTo(-1);
      if (e.key === "ArrowRight") goTo(1);
      if (e.key === "Delete" && selectedBoxId) handleDeleteBox(selectedBoxId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goTo, selectedBoxId, handleDeleteBox]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-6 text-center">
        {t("bboxEditor.emptyState")}
      </div>
    );
  }

  if (!result || !previewUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-6">
        {t("bboxEditor.selectImage")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => goTo(-1)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ← {t("bboxEditor.prev")}
          </button>
          <span className="text-sm text-gray-600">
            {result.imageName}{" "}
            <span className="text-gray-400">
              ({currentIndex + 1}/{items.length})
            </span>
          </span>
          <button
            type="button"
            disabled={currentIndex >= items.length - 1}
            onClick={() => goTo(1)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {t("bboxEditor.next")} →
          </button>
        </div>
        <p className="text-xs text-gray-400">{t("bboxEditor.keyboardHint")}</p>
      </div>

      <BBoxEditorCanvas
        imageUrl={previewUrl}
        boxes={result.boxes}
        imgWidth={result.imageWidth}
        imgHeight={result.imageHeight}
        mode={editorMode}
        selectedBoxId={selectedBoxId}
        hiddenIndices={hiddenIndices}
        onModeChange={setEditorMode}
        onSelectBox={setSelectedBoxId}
        onUpdateBox={handleUpdateBoxCoords}
        onDrawBox={handleDrawBox}
      />

      {editorMode === "draw" && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={drawCategory}
            onChange={(e) => setDrawCategory(e.target.value)}
            placeholder={t("detectionResult.drawCategoryPlaceholder")}
            className="rounded border border-gray-300 px-2 py-1 text-xs w-40"
          />
          {recentCategories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDrawCategory(c)}
              className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                drawCategory === c
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <ReviewBoxTable
        boxes={result.boxes}
        selectedBoxId={selectedBoxId}
        hiddenIndices={hiddenIndices}
        onSelectBox={setSelectedBoxId}
        onToggleVisibility={onToggleVisibility}
        onClassChange={handleClassChange}
        onDelete={handleDeleteBox}
      />
    </div>
  );
}

interface TableProps {
  boxes: import("@/types").BBox[];
  selectedBoxId: string | null;
  hiddenIndices: Set<string>;
  onSelectBox: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onClassChange: (id: string, className: string) => void;
  onDelete: (id: string) => void;
}

function ReviewBoxTable({
  boxes,
  selectedBoxId,
  hiddenIndices,
  onSelectBox,
  onToggleVisibility,
  onClassChange,
  onDelete,
}: TableProps) {
  const { t } = useTranslation();

  if (boxes.length === 0) {
    return <p className="py-4 text-sm text-gray-400 text-center">{t("resultTable.noTargets")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              {t("resultTable.category")}
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">x1</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">y1</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">x2</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">y2</th>
            <th className="px-3 py-2 w-10" />
            <th className="px-3 py-2 w-12" />
          </tr>
        </thead>
        <tbody>
          {boxes.map((box, i) => (
            <tr
              key={box.id}
              onClick={() => onSelectBox(box.id)}
              className={`border-t border-gray-100 cursor-pointer ${
                selectedBoxId === box.id ? "bg-primary-50" : "hover:bg-gray-50"
              }`}
            >
              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  defaultValue={box.className}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== box.className) {
                      onClassChange(box.id, e.target.value);
                    }
                  }}
                  className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                />
              </td>
              <td className="px-3 py-2 text-gray-600">{box.x1}</td>
              <td className="px-3 py-2 text-gray-600">{box.y1}</td>
              <td className="px-3 py-2 text-gray-600">{box.x2}</td>
              <td className="px-3 py-2 text-gray-600">{box.y2}</td>
              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onToggleVisibility(box.id)}
                  className="text-gray-400 hover:text-gray-600"
                  title={
                    hiddenIndices.has(box.id)
                      ? t("resultTable.showBox")
                      : t("resultTable.hideBox")
                  }
                >
                  {hiddenIndices.has(box.id) ? "👁‍🗨" : "👁"}
                </button>
              </td>
              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onDelete(box.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
