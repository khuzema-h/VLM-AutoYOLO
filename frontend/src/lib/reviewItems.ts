import type { Detection } from "@/types";

/** Merge history, current batch, and active result into one review list (newest first). */
export function buildReviewItems(
  history: Detection[],
  batchResults: Detection[],
  active: Detection | null,
): Detection[] {
  const byId = new Map<string, Detection>();
  for (const d of history) byId.set(d.id, d);
  for (const d of batchResults.filter(Boolean)) byId.set(d.id, d);
  if (active) byId.set(active.id, active);

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
