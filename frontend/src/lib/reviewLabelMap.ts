/** Source class name -> export class name for dataset export. */
export type ReviewLabelMap = Record<string, string>;

export function mergeReviewLabelMap(
  prev: ReviewLabelMap,
  sourceLabels: string[],
): ReviewLabelMap {
  const next: ReviewLabelMap = {};
  for (const src of [...sourceLabels].sort()) {
    next[src] = prev[src]?.trim() || src;
  }
  return next;
}

/** Return only renames that differ from the source name (for API payload). */
export function buildExportLabelMap(labelMap: ReviewLabelMap): Record<string, string> | undefined {
  const entries = Object.entries(labelMap).filter(
    ([src, exp]) => exp.trim() && exp.trim() !== src,
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([src, exp]) => [src, exp.trim()]));
}

export function collectClassNamesFromDetections(
  items: { boxes: { className: string }[] }[],
  extra: string[] = [],
): string[] {
  const set = new Set<string>(extra);
  items.forEach((d) => d.boxes.forEach((b) => set.add(b.className)));
  return [...set].sort();
}
