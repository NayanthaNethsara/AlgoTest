"use client";

import { useCallback, useState } from "react";

export type SnapshotTrigger = "autosave" | "ran" | "submitted";

export type Snapshot = {
  id: string;
  at: number;
  trigger: SnapshotTrigger;
  language: string;
  code: string;
};

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
    (trigger: SnapshotTrigger, language: string, code: string) => {
      setSnapshots((current) => {
        if (current[0]?.code === code && current[0]?.trigger === trigger) {
          return current;
        }
        const snapshot: Snapshot = {
          id: crypto.randomUUID(),
          at: Date.now(),
          trigger,
          language,
          code,
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
