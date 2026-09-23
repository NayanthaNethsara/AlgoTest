import { useState, useEffect, useRef } from "react";
import type { Difficulty, Sample } from "@/types/problem";

export const DRAFT_STORAGE_KEY = "mini_labyrithm_new_problem_draft";

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

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save problem metadata draft with debouncing
  useEffect(() => {
    if (isEditing || typeof window === "undefined") return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        // Exclude heavy data - only store statement, samples, and metadata
        const safePayload: ProblemDraftState = {
          slug: currentState.slug,
          title: currentState.title,
          difficulty: currentState.difficulty,
          maxScore: currentState.maxScore,
          timeLimitMs: currentState.timeLimitMs,
          memoryLimitMb: currentState.memoryLimitMb,
          statement: currentState.statement,
          constraints: currentState.constraints,
          samples: currentState.samples,
          published: currentState.published,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(safePayload));
      } catch {
        // Storage quota exceeded or private mode
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
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
