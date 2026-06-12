import type { CompareBox } from "@/services/api";

/** VLM label -> ground-truth class. Empty string means unmapped. */
export type CompareLabelMap = Record<string, string>;

export function mergeLabelMap(
  prev: CompareLabelMap,
  vlmLabels: string[],
  gtClasses: string[],
): CompareLabelMap {
  const next: CompareLabelMap = {};
  for (const vlmLabel of vlmLabels) {
    if (prev[vlmLabel] && gtClasses.includes(prev[vlmLabel])) {
      next[vlmLabel] = prev[vlmLabel];
    } else if (gtClasses.includes(vlmLabel)) {
      next[vlmLabel] = vlmLabel;
    } else {
      next[vlmLabel] = "";
    }
  }
  return next;
}

export function autoMapByName(vlmLabels: string[], gtClasses: string[]): CompareLabelMap {
  return mergeLabelMap({}, vlmLabels, gtClasses);
}

export function mapVlmBoxClass(className: string, labelMap: CompareLabelMap): string | null {
  const mapped = labelMap[className];
  return mapped ? mapped : null;
}

export function mapVlmBoxes(boxes: CompareBox[], labelMap: CompareLabelMap): CompareBox[] {
  const mapped: CompareBox[] = [];
  for (const box of boxes) {
    const gtClass = mapVlmBoxClass(box.className, labelMap);
    if (gtClass) {
      mapped.push({ ...box, className: gtClass });
    }
  }
  return mapped;
}

export function vlmLabelsForGtClass(labelMap: CompareLabelMap, gtClass: string): string[] {
  return Object.entries(labelMap)
    .filter(([, gt]) => gt === gtClass)
    .map(([vlm]) => vlm);
}
