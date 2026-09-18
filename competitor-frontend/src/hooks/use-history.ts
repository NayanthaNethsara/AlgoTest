"use client";

import { useCallback, useEffect, useState } from "react";
import { listSubmissionsAction } from "@/actions/code";
import { HISTORY_STORAGE_PREFIX, MAX_HISTORY_SNAPSHOTS } from "@/lib/constants";
import type { Snapshot, SnapshotTrigger } from "@/types/history";
import type { SubmissionItem } from "@/types/submission";

function storageKey(problemId: string) {
  return `${HISTORY_STORAGE_PREFIX}${problemId}`;
}

function loadSnapshots(problemId: string): Snapshot[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(storageKey(problemId));
  return raw ? (JSON.parse(raw) as Snapshot[]) : [];
}

function generateSnapshotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function mergeServerSubmissions(
  localSnapshots: Snapshot[],
  serverSubmissions: SubmissionItem[],
): Snapshot[] {
  if (!serverSubmissions || serverSubmissions.length === 0) {
    return localSnapshots;
  }

  const merged = [...localSnapshots];
  let hasChanges = false;

  for (const sub of serverSubmissions) {
    if (!sub.submissionId) continue;

    const existingIndex = merged.findIndex(
      (snapshot) => snapshot.submissionId === sub.submissionId,
    );

    if (existingIndex !== -1) {
      const existing = merged[existingIndex];
      if (!existing.code && sub.code) {
        merged[existingIndex] = {
          ...existing,
          code: sub.code,
          verdict: sub.status ?? existing.verdict,
          score: sub.score ?? existing.score,
        };
        hasChanges = true;
      }
    } else {
      merged.push({
        id: `server-${sub.submissionId}`,
        at: sub.timestamp || Date.now(),
        trigger: "submitted",
        language: sub.language ?? "cpp",
        code: sub.code ?? "",
        verdict: sub.status,
        score: sub.score,
        maxScore: sub.maxScore,
        submissionId: sub.submissionId,
      });
      hasChanges = true;
    }
  }

  if (!hasChanges) return localSnapshots;

  merged.sort((first, second) => second.at - first.at);
  return merged.slice(0, MAX_HISTORY_SNAPSHOTS);
}

export function useHistory(problemId: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() =>
    loadSnapshots(problemId),
  );

  useEffect(() => {
    let isCancelled = false;

    async function syncServerSubmissions() {
      try {
        const serverSubmissions = await listSubmissionsAction(problemId);
        if (isCancelled || serverSubmissions.length === 0) return;

        setSnapshots((current) => {
          const merged = mergeServerSubmissions(current, serverSubmissions);
          if (merged !== current && typeof window !== "undefined") {
            localStorage.setItem(storageKey(problemId), JSON.stringify(merged));
          }
          return merged;
        });
      } catch {
        // Fall back to local snapshots on network failure
      }
    }

    void syncServerSubmissions();

    return () => {
      isCancelled = true;
    };
  }, [problemId]);

  const record = useCallback(
    (
      trigger: SnapshotTrigger,
      language: string,
      code: string,
      extra?: {
        verdict?: string;
        score?: number;
        maxScore?: number;
        submissionId?: string;
      },
    ) => {
      setSnapshots((current) => {
        if (extra?.submissionId) {
          const idx = current.findIndex(
            (s) => s.submissionId === extra.submissionId,
          );
          if (idx !== -1) {
            const updated = [...current];
            updated[idx] = {
              ...updated[idx],
              verdict: extra.verdict ?? updated[idx].verdict,
              score: extra.score ?? updated[idx].score,
              maxScore: extra.maxScore ?? updated[idx].maxScore,
            };
            localStorage.setItem(
              storageKey(problemId),
              JSON.stringify(updated),
            );
            return updated;
          }
        }

        const lastAutosave = current.find((s) => s.trigger === "autosave");
        if (
          trigger === "autosave" &&
          lastAutosave &&
          lastAutosave.code === code
        ) {
          return current;
        }

        if (
          current[0]?.code === code &&
          current[0]?.trigger === trigger &&
          !extra?.submissionId
        ) {
          return current;
        }

        const snapshot: Snapshot = {
          id: generateSnapshotId(),
          at: Date.now(),
          trigger,
          language,
          code,
          verdict: extra?.verdict,
          score: extra?.score,
          maxScore: extra?.maxScore,
          submissionId: extra?.submissionId,
        };
        const next = [snapshot, ...current].slice(0, MAX_HISTORY_SNAPSHOTS);
        localStorage.setItem(storageKey(problemId), JSON.stringify(next));
        return next;
      });
    },
    [problemId],
  );

  return { snapshots, record };
}
