"use client";

import { useCallback, useState } from "react";
import type { Snapshot, SnapshotTrigger } from "@/types/history";

const MAX_SNAPSHOTS = 50;

function storageKey(problemId: string) {
  return `mini-algothon:history:${problemId}`;
}

function loadSnapshots(problemId: string): Snapshot[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(storageKey(problemId));
  return raw ? (JSON.parse(raw) as Snapshot[]) : [];
}

export function useHistory(problemId: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => loadSnapshots(problemId));

  const record = useCallback(
    (
      trigger: SnapshotTrigger,
      language: string,
      code: string,
      extra?: { verdict?: string; score?: number; maxScore?: number; submissionId?: string },
    ) => {
      setSnapshots((current) => {
        if (extra?.submissionId) {
          const idx = current.findIndex((s) => s.submissionId === extra.submissionId);
          if (idx !== -1) {
            const updated = [...current];
            updated[idx] = {
              ...updated[idx],
              verdict: extra.verdict ?? updated[idx].verdict,
              score: extra.score ?? updated[idx].score,
              maxScore: extra.maxScore ?? updated[idx].maxScore,
            };
            localStorage.setItem(storageKey(problemId), JSON.stringify(updated));
            return updated;
          }
        }

        const lastAutosave = current.find((s) => s.trigger === "autosave");
        if (trigger === "autosave" && lastAutosave && lastAutosave.code === code) {
          return current;
        }

        if (current[0]?.code === code && current[0]?.trigger === trigger && !extra?.submissionId) {
          return current;
        }

        const snapshot: Snapshot = {
          id: crypto.randomUUID(),
          at: Date.now(),
          trigger,
          language,
          code,
          verdict: extra?.verdict,
          score: extra?.score,
          maxScore: extra?.maxScore,
          submissionId: extra?.submissionId,
        };
        const next = [snapshot, ...current].slice(0, MAX_SNAPSHOTS);
        localStorage.setItem(storageKey(problemId), JSON.stringify(next));
        return next;
      });
    },
    [problemId],
  );

  return { snapshots, record };
}
