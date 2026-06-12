import { Input, Radio, Badge, Empty } from "antd";
import {
  SearchOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useCompareContext } from "@/components/Compare/CompareContext";

export function CompareImageList() {
  const {
    compareImage,
    setCompareImage,
    loadingImages,
    searchQuery,
    setSearchQuery,
    splitFilter,
    setSplitFilter,
    cacheFilter,
    setCacheFilter,
    filteredImages,
  } = useCompareContext();

  return (
    <aside className="flex-shrink-0 w-72 border-r border-gray-200 bg-white flex flex-col min-h-0 h-full">
      <div className="px-3 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Images ({filteredImages.length})
        </h2>
      </div>

      <div className="px-3 py-3 border-b border-gray-100 flex flex-col gap-2">
        <Input
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Filter image list..."
          allowClear
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-white"
          size="small"
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0">
              Split
            </span>
            <Radio.Group
              size="small"
              value={splitFilter}
              onChange={(e) => setSplitFilter(e.target.value)}
              className="text-[11px]"
            >
              <Radio.Button value="all">All</Radio.Button>
              <Radio.Button value="train">Train</Radio.Button>
              <Radio.Button value="test">Test</Radio.Button>
            </Radio.Group>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0">
              Cache
            </span>
            <Radio.Group
              size="small"
              value={cacheFilter}
              onChange={(e) => setCacheFilter(e.target.value)}
            >
              <Radio.Button value="all">All</Radio.Button>
              <Radio.Button value="cached">Cached</Radio.Button>
              <Radio.Button value="not_cached">Pending</Radio.Button>
            </Radio.Group>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {loadingImages ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
            <span className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
            <span className="text-xs">Loading image list...</span>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex items-center justify-center p-6">
            <Empty description="No matching images found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredImages.map((img) => {
              const active = compareImage?.key === img.key;
              return (
                <button
                  key={img.key}
                  type="button"
                  onClick={() => setCompareImage(img)}
                  className={`text-left w-full px-3 py-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                    active
                      ? "bg-primary-50/80 border-primary-300 shadow-sm"
                      : "bg-white hover:bg-gray-50/80 border-gray-200/60 hover:border-gray-300"
                  }`}
                >
                  <div className="flex flex-col gap-1 min-w-0 pr-2">
                    <span
                      className={`text-xs font-semibold truncate ${
                        active ? "text-primary-700" : "text-gray-700"
                      }`}
                    >
                      {pathBasename(img.key)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono truncate">
                      {pathDirname(img.key)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      count={img.split.toUpperCase()}
                      style={{
                        backgroundColor: img.split === "train" ? "#EFF6FF" : "#F5F3FF",
                        color: img.split === "train" ? "#1D4ED8" : "#6D28D9",
                        border: img.split === "train" ? "1px solid #BFDBFE" : "1px solid #DDD6FE",
                        fontSize: "9px",
                        fontWeight: 700,
                        padding: "0 4px",
                        borderRadius: "4px",
                      }}
                      className="m-0"
                    />
                    {img.hasVlmPrediction ? (
                      <CheckCircleFilled
                        className="text-green-500 text-sm"
                        title="VLM predictions cached"
                      />
                    ) : (
                      <ClockCircleOutlined
                        className="text-amber-400 text-xs"
                        title="VLM prediction pending"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function pathBasename(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1];
}

function pathDirname(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, parts.length - 1).join("/");
}
