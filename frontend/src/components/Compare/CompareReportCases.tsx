import { useMemo, useState } from "react";
import { Button, Image, Radio, Table, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { compareImageUrl } from "@/services/api";
import {
  caseFilterLabel,
  filterReportCases,
  type CaseFilter,
  type CaseFilterKind,
} from "@/lib/compareReportCases";
import type { CompareReportImageStat, CompareReportResponse } from "@/services/api";

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

interface CompareReportCasesProps {
  dataset: string;
  report: CompareReportResponse;
  caseFilter: CaseFilter;
  onCaseFilterChange: (filter: CaseFilter) => void;
  onInvestigateImage: (key: string) => void;
}

function CaseThumbnail({ dataset, imagePath, label }: { dataset: string; imagePath: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="w-16 h-12 rounded-lg bg-gray-100 border border-dashed border-gray-200" />;
  }
  return (
    <Image
      src={compareImageUrl(dataset, imagePath)}
      alt={label}
      width={64}
      height={48}
      className="rounded-lg object-cover border border-gray-200"
      style={{ objectFit: "cover" }}
      preview
      onError={() => setFailed(true)}
    />
  );
}

export function CompareReportCases({
  dataset,
  report,
  caseFilter,
  onCaseFilterChange,
  onInvestigateImage,
}: CompareReportCasesProps) {
  const { t } = useTranslation();

  const filteredCases = useMemo(
    () => filterReportCases(report.imageStats, caseFilter),
    [report.imageStats, caseFilter],
  );

  const setKind = (kind: CaseFilterKind) => {
    onCaseFilterChange({ kind, className: caseFilter.className });
  };

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            {t("compare.casesTitle")}
          </h3>
          <p className="text-[10px] text-gray-400 mt-0.5">{t("compare.casesHint")}</p>
        </div>
        <Tag color="blue" className="m-0 font-semibold">
          {caseFilterLabel(caseFilter, t)} · {filteredCases.length}
        </Tag>
      </div>

      <Radio.Group
        size="small"
        value={caseFilter.kind}
        onChange={(e) => setKind(e.target.value)}
        className="flex flex-wrap gap-1"
      >
        <Radio.Button value="issues">{t("compare.casesFilterIssues")}</Radio.Button>
        <Radio.Button value="fn">{t("compare.casesFilterFn")}</Radio.Button>
        <Radio.Button value="fp">{t("compare.casesFilterFp")}</Radio.Button>
        <Radio.Button value="unmapped">{t("compare.casesFilterUnmapped")}</Radio.Button>
        <Radio.Button value="tp">{t("compare.casesFilterTp")}</Radio.Button>
      </Radio.Group>

      {caseFilter.className && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 font-semibold">{t("compare.casesClassFilter")}</span>
          <Tag closable onClose={() => onCaseFilterChange({ ...caseFilter, className: undefined })}>
            {caseFilter.className}
          </Tag>
        </div>
      )}

      <Table
        size="small"
        dataSource={filteredCases.map((row) => ({ ...row, tableKey: row.key }))}
        rowKey="tableKey"
        pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ["15", "30", "50"] }}
        locale={{ emptyText: t("compare.casesEmpty") }}
        columns={[
          {
            title: "",
            key: "thumb",
            width: 72,
            render: (_: unknown, row: CompareReportImageStat) => (
              <CaseThumbnail
                dataset={dataset}
                imagePath={row.imagePath}
                label={row.key.split("/").pop() ?? row.key}
              />
            ),
          },
          {
            title: t("compare.casesImage"),
            dataIndex: "key",
            key: "key",
            render: (key: string, row: CompareReportImageStat) => (
              <div className="flex flex-col max-w-xs">
                <span className="font-mono text-[10px] text-gray-700 truncate" title={key}>
                  {key.split("/").pop() ?? key}
                </span>
                <span className="text-[9px] text-gray-400 uppercase">{row.split}</span>
              </div>
            ),
          },
          {
            title: "TP",
            dataIndex: "tp",
            key: "tp",
            align: "center",
            width: 56,
            render: (v: number) => <span className="text-emerald-600 font-bold">{v}</span>,
          },
          {
            title: "FP",
            dataIndex: "fp",
            key: "fp",
            align: "center",
            width: 56,
            render: (v: number) => (
              <span className={v > 0 ? "text-red-500 font-bold" : "text-gray-400"}>{v}</span>
            ),
          },
          {
            title: "FN",
            dataIndex: "fn",
            key: "fn",
            align: "center",
            width: 56,
            render: (v: number) => (
              <span className={v > 0 ? "text-amber-600 font-bold" : "text-gray-400"}>{v}</span>
            ),
          },
          {
            title: t("compare.reportF1"),
            dataIndex: "f1",
            key: "f1",
            align: "right",
            width: 72,
            render: (v: number) => pct(v),
          },
          {
            title: "",
            key: "action",
            align: "right",
            width: 100,
            render: (_: unknown, row: CompareReportImageStat) => (
              <Button
                type="link"
                size="small"
                icon={<SearchOutlined />}
                className="font-semibold px-0"
                onClick={() => onInvestigateImage(row.key)}
              >
                {t("compare.casesInvestigate")}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}

export function MetricLink({
  value,
  disabled,
  onClick,
  tone = "default",
}: {
  value: number;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "tp" | "fp" | "fn";
}) {
  if (!value || disabled) {
    return <span className="text-gray-400">{value}</span>;
  }

  const toneClass =
    tone === "tp"
      ? "text-emerald-600"
      : tone === "fp"
        ? "text-red-500"
        : tone === "fn"
          ? "text-amber-600"
          : "text-primary-600";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-bold underline-offset-2 hover:underline ${toneClass}`}
    >
      {value}
    </button>
  );
}
