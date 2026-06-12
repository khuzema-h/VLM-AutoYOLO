import { Segmented } from "antd";
import { EyeOutlined, BarChartOutlined } from "@ant-design/icons";
import { CompareView } from "@/components/Compare/CompareView";
import { CompareReportPanel } from "@/components/Compare/CompareReportPanel";
import { useCompareContext } from "@/components/Compare/CompareContext";

export function CompareMain() {
  const { t } = useTranslation();
  const { stats, taskStatus, compareTab, setCompareTab } = useCompareContext();

  const reportReady =
    stats &&
    stats.cached === stats.total &&
    stats.total > 0 &&
    taskStatus?.status !== "running";

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <Segmented
          value={compareTab}
          onChange={(value) => setCompareTab(value as "image" | "report")}
          options={[
            {
              label: (
                <span className="flex items-center gap-1.5 px-1">
                  <EyeOutlined />
                  {t("compare.tabImageCompare")}
                </span>
              ),
              value: "image",
            },
            {
              label: (
                <span className="flex items-center gap-1.5 px-1">
                  <BarChartOutlined />
                  {t("compare.tabDatasetReport")}
                  {reportReady && (
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </span>
              ),
              value: "report",
            },
          ]}
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {compareTab === "image" ? <CompareView /> : <CompareReportPanel />}
      </div>
    </div>
  );
}
