import type { CompareReportImageStat } from "@/services/api";

export type CaseFilterKind = "issues" | "fp" | "fn" | "tp" | "unmapped";

export interface CaseFilter {
  kind: CaseFilterKind;
  className?: string;
}

function classMetric(
  img: CompareReportImageStat,
  className: string | undefined,
  field: "tp" | "fp" | "fn",
): number {
  if (!className) return img[field];
  return img.classStats[className]?.[field] ?? 0;
}

function matchesFilter(img: CompareReportImageStat, filter: CaseFilter): boolean {
  const { kind, className } = filter;

  if (kind === "unmapped") {
    return className ? false : img.unmapped > 0;
  }

  if (kind === "fp") return classMetric(img, className, "fp") > 0;
  if (kind === "fn") return classMetric(img, className, "fn") > 0;
  if (kind === "tp") return classMetric(img, className, "tp") > 0;

  return classMetric(img, className, "fp") > 0 || classMetric(img, className, "fn") > 0;
}

function sortScore(img: CompareReportImageStat, filter: CaseFilter): number {
  const { kind, className } = filter;
  if (kind === "fp") return classMetric(img, className, "fp");
  if (kind === "fn") return classMetric(img, className, "fn");
  if (kind === "tp") return classMetric(img, className, "tp");
  if (kind === "unmapped") return img.unmapped;
  return classMetric(img, className, "fp") + classMetric(img, className, "fn");
}

export function filterReportCases(
  imageStats: CompareReportImageStat[],
  filter: CaseFilter,
): CompareReportImageStat[] {
  return imageStats
    .filter((img) => matchesFilter(img, filter))
    .sort((a, b) => sortScore(b, filter) - sortScore(a, filter));
}

export function caseFilterLabel(
  filter: CaseFilter,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const kindLabels: Record<CaseFilterKind, string> = {
    issues: t("compare.casesFilterIssues"),
    fp: t("compare.casesFilterFp"),
    fn: t("compare.casesFilterFn"),
    tp: t("compare.casesFilterTp"),
    unmapped: t("compare.casesFilterUnmapped"),
  };
  const base = kindLabels[filter.kind];
  return filter.className ? `${base} · ${filter.className}` : base;
}
