import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Empty } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useLoadAll } from "@/hooks/useLoadAll";
import type { Detection } from "@/types";

interface Props {
  items: Detection[];
  activeId: string | null;
  total: number;
  loadedCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onSelect: (det: Detection) => void;
}

export function ReviewImageList({
  items,
  activeId,
  total,
  loadedCount,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [loadingAll, handleLoadAll] = useLoadAll(fetchNextPage);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((d) => d.imageName.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <aside className="flex-shrink-0 w-72 border-r border-gray-200 bg-white flex flex-col min-h-0 h-full">
      <div className="px-3 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {t("bboxEditor.imageListTitle", { count: total || items.length })}
        </h2>
        {total > 0 && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {t("bboxEditor.loadedOfTotal", { loaded: loadedCount, total })}
          </p>
        )}
      </div>

      <div className="px-3 py-3 border-b border-gray-100 space-y-2">
        <Input
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder={t("bboxEditor.searchPlaceholder")}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
        />
        {hasNextPage && (
          <button
            type="button"
            disabled={loadingAll || isFetchingNextPage}
            onClick={handleLoadAll}
            className="w-full rounded border border-primary-200 py-1 text-[10px] font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
          >
            {loadingAll || isFetchingNextPage
              ? t("common.loading")
              : t("bboxEditor.loadAll", { remaining: total - loadedCount })}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {items.length === 0 ? (
          <div className="bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex items-center justify-center p-6">
            <Empty
              description={t("bboxEditor.noImages")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex items-center justify-center p-6">
            <Empty
              description={t("bboxEditor.noMatches")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((det) => {
              const active = det.id === activeId;
              return (
                <button
                  key={det.id}
                  type="button"
                  onClick={() => onSelect(det)}
                  className={`text-left w-full px-3 py-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                    active
                      ? "bg-primary-50/80 border-primary-300 shadow-sm"
                      : "bg-white hover:bg-gray-50/80 border-gray-200/60 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`text-xs font-semibold truncate min-w-0 ${
                      active ? "text-primary-700" : "text-gray-700"
                    }`}
                  >
                    {det.imageName}
                  </span>
                  <span
                    className={`shrink-0 ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      active
                        ? "bg-primary-500 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {det.boxes.length}
                  </span>
                </button>
              );
            })}
            {isFetchingNextPage && (
              <p className="text-xs text-center text-gray-400 py-2">{t("common.loading")}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
