import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Modal,
  Progress,
  Slider,
  Spin,
  Statistic,
  Table,
  Tag,
  message,
} from "antd";
import {
  BarChartOutlined,
  DotChartOutlined,
  ExperimentOutlined,
  ExportOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { downloadCompareReportHtml } from "@/lib/compareReportHtml";
import { buildReportThumbnails } from "@/lib/compareReportThumbnails";
import { useAppStore } from "@/store/useAppStore";
import { useCompareContext } from "@/components/Compare/CompareContext";
import { vlmLabelsForGtClass } from "@/lib/compareLabelMap";
import type { CaseFilter } from "@/lib/compareReportCases";
import { CompareReportCases, MetricLink } from "@/components/Compare/CompareReportCases";
import {
  fetchCompareReport,
  type CompareReportResponse,
} from "@/services/api";

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function metricColor(value: number, good = 0.7) {
  return value >= good ? "#10B981" : "#F59E0B";
}

export function CompareReportPanel() {
  const { t } = useTranslation();
  const {
    compareVlmLabels,
    compareLabelMap,
    compareMaxBBoxArea,
    compareMinConfidence,
  } = useAppStore();
  const { compareDataset, stats, taskStatus, investigateImageByKey } = useCompareContext();

  const [iouThreshold, setIouThreshold] = useState(0.5);
  const [report, setReport] = useState<CompareReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>({ kind: "issues" });
  const [exportingHtml, setExportingHtml] = useState(false);
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 });
  const exportAbortRef = useRef<AbortController | null>(null);
  const autoLoadedRef = useRef(false);

  const setCaseFilterForClass = (kind: CaseFilter["kind"], className?: string) => {
    setCaseFilter({ kind, className });
  };

  const handleExportHtml = async () => {
    if (!report?.imageStats?.length || !compareDataset) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportingHtml(true);
    setThumbProgress({ done: 0, total: report.imageStats.length });
    try {
      const labelMap = Object.fromEntries(
        Object.entries(compareLabelMap).filter(([, gt]) => Boolean(gt)),
      );
      const thumbnails = await buildReportThumbnails(compareDataset, report.imageStats, {
        vlmLabels: compareVlmLabels,
        labelMap,
        maxBBoxArea: compareMaxBBoxArea,
        minConfidence: compareMinConfidence,
        onProgress: (done, total) => setThumbProgress({ done, total }),
        signal: controller.signal,
      });
      downloadCompareReportHtml(report, thumbnails);
      message.success(t("compare.reportExportHtmlSuccess", { count: Object.keys(thumbnails).length }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      message.error(t("compare.reportExportHtmlFailed") + ": " + msg);
    } finally {
      setExportingHtml(false);
      exportAbortRef.current = null;
    }
  };

  const handleCancelExportHtml = () => {
    exportAbortRef.current?.abort();
    setExportingHtml(false);
  };

  const canGenerate =
    Boolean(compareDataset) &&
    Boolean(stats) &&
    stats!.cached === stats!.total &&
    stats!.total > 0 &&
    taskStatus?.status !== "running" &&
    compareVlmLabels.length > 0;

  const loadReport = useCallback(async () => {
    if (!compareDataset || !canGenerate) return;
    setLoading(true);
    setError(null);
    try {
      const labelMap = Object.fromEntries(
        Object.entries(compareLabelMap).filter(([, gt]) => Boolean(gt)),
      );
      const data = await fetchCompareReport(compareDataset, {
        iouThreshold,
        vlmLabels: compareVlmLabels,
        maxBBoxArea: compareMaxBBoxArea,
        minConfidence: compareMinConfidence,
        labelMap,
      });
      setReport(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [
    canGenerate,
    compareDataset,
    compareLabelMap,
    compareMaxBBoxArea,
    compareMinConfidence,
    compareVlmLabels,
    iouThreshold,
  ]);

  useEffect(() => {
    if (
      taskStatus?.status === "completed" &&
      canGenerate &&
      !autoLoadedRef.current
    ) {
      autoLoadedRef.current = true;
      loadReport();
    }
    if (taskStatus?.status !== "completed") {
      autoLoadedRef.current = false;
    }
  }, [taskStatus?.status, canGenerate, loadReport]);

  useEffect(() => {
    setReport(null);
    setError(null);
    setCaseFilter({ kind: "issues" });
    autoLoadedRef.current = false;
  }, [
    compareDataset,
    compareVlmLabels,
    compareMaxBBoxArea,
    compareMinConfidence,
    compareLabelMap,
  ]);

  if (!compareDataset) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        {t("compare.reportSelectDataset")}
      </div>
    );
  }

  if (!canGenerate) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <Alert
          type="info"
          showIcon
          message={t("compare.reportNotReadyTitle")}
          description={t("compare.reportNotReadyDesc")}
          className="max-w-lg"
        />
        {stats && (
          <div className="w-full max-w-md">
            <div className="text-xs font-semibold text-gray-500 mb-2">
              {t("compare.reportCacheProgress", {
                cached: stats.cached,
                total: stats.total,
              })}
            </div>
            <Progress percent={stats.progressPercent} status="active" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <BarChartOutlined className="text-primary-600" />
            {t("compare.reportTitle")}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {compareDataset} · {report?.imagesEvaluated ?? stats?.total} {t("compare.reportImages")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600">
            <span>{t("compare.reportMatchIou")}</span>
            <Slider
              min={0.1}
              max={0.9}
              step={0.05}
              value={iouThreshold}
              onChange={setIouThreshold}
              style={{ width: 120, margin: 0 }}
            />
            <span className="font-mono text-primary-600 w-8">{iouThreshold}</span>
          </div>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={loadReport}
            className="bg-primary-600 hover:bg-primary-700 border-none font-bold"
          >
            {report ? t("compare.reportRefresh") : t("compare.reportGenerate")}
          </Button>
          {report && (
            <Button
              icon={<ExportOutlined />}
              loading={exportingHtml}
              onClick={handleExportHtml}
              disabled={!report.imageStats?.length}
            >
              {t("compare.reportExportHtml")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert type="error" showIcon message={t("compare.reportFailed")} description={error} />
      )}

      <Modal
        open={exportingHtml}
        footer={null}
        closable={false}
        centered
        title={t("compare.reportExportHtmlPreparing")}
      >
        <div className="flex flex-col gap-3 py-2">
          <p className="text-sm text-gray-600">{t("compare.reportExportHtmlPreparingDesc")}</p>
          <Progress
            percent={
              thumbProgress.total > 0
                ? Math.round((thumbProgress.done / thumbProgress.total) * 100)
                : 0
            }
            status="active"
          />
          <p className="text-xs text-gray-400 font-semibold">
            {thumbProgress.done} / {thumbProgress.total}
          </p>
          <Button onClick={handleCancelExportHtml}>{t("common.cancel")}</Button>
        </div>
      </Modal>

      {loading && !report && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[300px]">
          <Spin size="large" />
          <span className="text-sm font-semibold text-gray-500">{t("compare.reportLoading")}</span>
          {stats && stats.total > 500 && (
            <span className="text-xs text-gray-400">{t("compare.reportLoadingLarge", { total: stats.total })}</span>
          )}
        </div>
      )}

      {report && (
        <>
          <div className="bg-gray-50/80 border border-gray-200/60 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-400 font-bold uppercase tracking-wide text-[10px] block mb-1">
                {t("compare.reportVlmLabels")}
              </span>
              <div className="flex flex-wrap gap-1">
                {report.vlmLabels.map((label) => (
                  <Tag key={label} color="blue" className="m-0 text-[10px]">
                    {label}
                  </Tag>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-400 font-bold uppercase tracking-wide text-[10px] block mb-1">
                {t("compare.reportConstraints")}
              </span>
              <span className="font-semibold text-gray-600">
                {report.maxBBoxArea < 1 && `max ${Math.round(report.maxBBoxArea * 100)}% area`}
                {report.maxBBoxArea < 1 && report.minConfidence > 0 && " · "}
                {report.minConfidence > 0 && `min ${Math.round(report.minConfidence * 100)}% conf`}
                {report.maxBBoxArea >= 1 && report.minConfidence <= 0 && t("compare.reportNoConstraints")}
              </span>
            </div>
            <div>
              <span className="text-gray-400 font-bold uppercase tracking-wide text-[10px] block mb-1">
                {t("compare.reportBoxCounts")}
              </span>
              <span className="font-semibold text-gray-600">
                GT {report.gtBoxTotal} · VLM {report.vlmBoxTotal}
                {report.unmappedVlmTotal > 0 && ` · ${report.unmappedVlmTotal} unmapped`}
              </span>
            </div>
            <div>
              <span className="text-gray-400 font-bold uppercase tracking-wide text-[10px] block mb-1">
                {t("compare.reportAvgBoxes")}
              </span>
              <span className="font-semibold text-gray-600">
                GT {report.avgGtBoxesPerImage.toFixed(1)} · VLM {report.avgVlmBoxesPerImage.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm border-gray-200/80 rounded-2xl">
              <Statistic
                title={<span className="text-xs font-bold text-gray-400 uppercase">{t("compare.reportF1")}</span>}
                value={report.overall.global.f1 * 100}
                precision={1}
                suffix="%"
                valueStyle={{ color: metricColor(report.overall.global.f1), fontWeight: 800 }}
                prefix={<ExperimentOutlined />}
              />
            </Card>
            <Card className="shadow-sm border-gray-200/80 rounded-2xl">
              <Statistic
                title={<span className="text-xs font-bold text-gray-400 uppercase">{t("compare.reportPrecision")}</span>}
                value={report.overall.global.precision * 100}
                precision={1}
                suffix="%"
                valueStyle={{ color: metricColor(report.overall.global.precision), fontWeight: 800 }}
                prefix={<SafetyOutlined />}
              />
              <div className="text-[10px] text-gray-400 mt-1 font-semibold">
                TP {report.overall.global.tp} · FP {report.overall.global.fp}
              </div>
            </Card>
            <Card className="shadow-sm border-gray-200/80 rounded-2xl">
              <Statistic
                title={<span className="text-xs font-bold text-gray-400 uppercase">{t("compare.reportRecall")}</span>}
                value={report.overall.global.recall * 100}
                precision={1}
                suffix="%"
                valueStyle={{ color: metricColor(report.overall.global.recall), fontWeight: 800 }}
                prefix={<SafetyOutlined />}
              />
              <div className="text-[10px] text-gray-400 mt-1 font-semibold">
                TP {report.overall.global.tp} · FN {report.overall.global.fn}
              </div>
            </Card>
            <Card className="shadow-sm border-gray-200/80 rounded-2xl">
              <Statistic
                title={<span className="text-xs font-bold text-gray-400 uppercase">{t("compare.reportMeanIou")}</span>}
                value={report.overall.global.meanIou * 100}
                precision={1}
                suffix="%"
                valueStyle={{ color: metricColor(report.overall.global.meanIou, 0.6), fontWeight: 800 }}
                prefix={<DotChartOutlined />}
              />
            </Card>
          </div>

          {report.splitStats.length > 1 && (
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                {t("compare.reportSplitBreakdown")}
              </h3>
              <Table
                size="small"
                pagination={false}
                dataSource={report.splitStats.map((row) => ({ ...row, key: row.split }))}
                columns={[
                  { title: t("compare.reportSplit"), dataIndex: "split", key: "split", render: (v) => <span className="font-bold uppercase">{v}</span> },
                  { title: t("compare.reportImages"), dataIndex: "images", key: "images", align: "center" },
                  { title: "TP", dataIndex: "tp", key: "tp", align: "center" },
                  { title: "FP", dataIndex: "fp", key: "fp", align: "center" },
                  { title: "FN", dataIndex: "fn", key: "fn", align: "center" },
                  { title: t("compare.reportPrecision"), dataIndex: "precision", key: "precision", align: "right", render: (v: number) => pct(v) },
                  { title: t("compare.reportRecall"), dataIndex: "recall", key: "recall", align: "right", render: (v: number) => pct(v) },
                  { title: t("compare.reportF1"), dataIndex: "f1", key: "f1", align: "right", render: (v: number) => <span className="font-bold text-primary-600">{pct(v)}</span> },
                  { title: t("compare.reportMeanIou"), dataIndex: "meanIou", key: "meanIou", align: "right", render: (v: number) => pct(v) },
                ]}
              />
            </div>
          )}

          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
              {t("compare.reportPerClass")}
            </h3>
            <Table
              size="small"
              pagination={false}
              dataSource={report.overall.classStats.map((row) => ({
                ...row,
                key: row.className,
                mappedVlmLabels: vlmLabelsForGtClass(compareLabelMap, row.className),
              }))}
              columns={[
                {
                  title: t("compare.reportGtClass"),
                  dataIndex: "className",
                  key: "className",
                  render: (text: string, row: { mappedVlmLabels: string[] }) => (
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-800">{text}</span>
                      {row.mappedVlmLabels.length > 0 && (
                        <span className="text-[10px] text-blue-500">
                          VLM: {row.mappedVlmLabels.join(", ")}
                        </span>
                      )}
                    </div>
                  ),
                },
                { title: "GT", dataIndex: "gtCount", key: "gtCount", align: "center" },
                { title: "VLM", dataIndex: "vlmCount", key: "vlmCount", align: "center" },
                {
                  title: "TP",
                  dataIndex: "tp",
                  key: "tp",
                  align: "center",
                  render: (v: number, row: { className: string }) => (
                    <MetricLink
                      value={v}
                      tone="tp"
                      onClick={() => setCaseFilterForClass("tp", row.className)}
                    />
                  ),
                },
                {
                  title: "FP",
                  dataIndex: "fp",
                  key: "fp",
                  align: "center",
                  render: (v: number, row: { className: string }) => (
                    <MetricLink
                      value={v}
                      tone="fp"
                      onClick={() => setCaseFilterForClass("fp", row.className)}
                    />
                  ),
                },
                {
                  title: "FN",
                  dataIndex: "fn",
                  key: "fn",
                  align: "center",
                  render: (v: number, row: { className: string }) => (
                    <MetricLink
                      value={v}
                      tone="fn"
                      onClick={() => setCaseFilterForClass("fn", row.className)}
                    />
                  ),
                },
                { title: t("compare.reportPrecision"), dataIndex: "precision", key: "precision", align: "right", render: (v: number) => pct(v) },
                { title: t("compare.reportRecall"), dataIndex: "recall", key: "recall", align: "right", render: (v: number) => pct(v) },
                { title: t("compare.reportF1"), dataIndex: "f1", key: "f1", align: "right", render: (v: number) => <span className="font-bold text-primary-600">{pct(v)}</span> },
                { title: t("compare.reportMeanIou"), dataIndex: "meanIou", key: "meanIou", align: "right", render: (v: number) => pct(v) },
              ]}
            />
          </div>

          {report.imageStats?.length ? (
            <CompareReportCases
              dataset={compareDataset}
              report={report}
              caseFilter={caseFilter}
              onCaseFilterChange={setCaseFilter}
              onInvestigateImage={investigateImageByKey}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message={t("compare.casesRefreshRequired")}
            />
          )}

          {report.imagesSkipped > 0 && (
            <Alert
              type="warning"
              showIcon
              message={t("compare.reportSkipped", { count: report.imagesSkipped })}
            />
          )}
        </>
      )}
    </div>
  );
}
