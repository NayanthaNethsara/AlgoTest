import type { SubmissionStatusResponse } from "../types/submission";

export function shouldApplySubmissionProgress(
  previous: SubmissionStatusResponse | undefined,
  next: SubmissionStatusResponse,
): boolean {
  if (!previous) return true;
  const terminal = (value: SubmissionStatusResponse) =>
    value.status === "passed" || value.status === "failed";
  if (previous.attemptStartedAt && next.attemptStartedAt) {
    const before = Date.parse(previous.attemptStartedAt);
    const after = Date.parse(next.attemptStartedAt);
    if (before !== after) return after > before;
  } else if (next.attemptStartedAt) {
    return (
      !previous.finishedAt ||
      Date.parse(next.attemptStartedAt) > Date.parse(previous.finishedAt)
    );
  } else if (previous.attemptStartedAt && !terminal(next)) {
    return false;
  }
  if (
    next.finishedAt && previous.attemptStartedAt &&
    Date.parse(next.finishedAt) < Date.parse(previous.attemptStartedAt)
  ) return false;
  if (terminal(previous)) return false;
  if (terminal(next)) return true;
  if (previous.status === "running" && next.status === "queued") return false;
  return next.testsDone >= previous.testsDone;
}
