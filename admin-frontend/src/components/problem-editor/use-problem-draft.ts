import { useState, useEffect } from "react";
import type { Difficulty, Sample, TestCaseInput } from "@/types/problem";

export const DRAFT_STORAGE_KEY = "mini_algothon_new_problem_draft";

export interface ProblemDraftState {
  slug: string;
  title: string;
  difficulty: Difficulty;
  maxScore: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints?: string;
  samples: Sample[];
  tests: TestCaseInput[];
  published: boolean;
}

export function useProblemDraft(
  isEditing: boolean,
  currentState: ProblemDraftState,
  applyDraft: (draft: ProblemDraftState) => void
) {
  const [draftRestored, setDraftRestored] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(
    () =>
      !isEditing &&
      typeof window !== "undefined" &&
      Boolean(localStorage.getItem(DRAFT_STORAGE_KEY))
  );

  // Auto-save draft on every change when creating a new problem
  useEffect(() => {
    if (isEditing || typeof window === "undefined") return;

    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(currentState));
    } catch {
      // Storage quota exceeded or private mode
    }
  }, [isEditing, currentState]);

  function restoreDraft() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ProblemDraftState;
      applyDraft(parsed);
      setDraftRestored(true);
      setHasSavedDraft(false);
    } catch {
      // Ignore corrupted json
    }
  }

  function discardDraft() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    setHasSavedDraft(false);
  }

  function clearDraftOnSuccess() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  return {
    hasSavedDraft,
    draftRestored,
    restoreDraft,
    discardDraft,
    clearDraftOnSuccess,
  };
}
