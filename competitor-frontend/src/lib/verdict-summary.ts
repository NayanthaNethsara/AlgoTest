import type { SubtaskResult } from "@/types/code";

/**
 * A submission can fail with different verdicts across different test cases
 * (e.g. WA on one, RTE on another). Collapsing that to a single verdict hides
 * the rest, so this builds a "3 WA · 1 RTE" style breakdown instead.
 */
export function summarizeSubtasks(subtasks: SubtaskResult[]): string | null {
  if (!subtasks.length) return null;

  const counts = new Map<string, number>();
  let passedCount = 0;
  for (const t of subtasks) {
    if (t.passed) passedCount++;
    const v = t.verdict ?? (t.passed ? "AC" : "WA");
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const failureParts = Array.from(counts.entries())
    .filter(([verdict]) => verdict !== "AC")
    .map(([verdict, count]) => `${count} ${verdict}`);

  if (!failureParts.length) return null;

  return `${passedCount}/${subtasks.length} passed — ${failureParts.join(" · ")}`;
}
