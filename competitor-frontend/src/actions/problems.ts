"use server";

import { backendFetch } from "@/lib/api/server";
import type { ChallengeProgressMap } from "@/types/challenge";
import type { Difficulty, Problem, Sample } from "@/types/problem";

type BackendProblemResponse = {
  id?: string;
  slug?: string;
  title?: string;
  difficulty?: string;
  statement?: string;
  constraints?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  maxScore?: number;
  samples?: Sample[];
};

function mapToProblem(raw: BackendProblemResponse): Problem {
  return {
    id: raw.id || raw.slug || "",
    slug: raw.slug || raw.id || "",
    title: raw.title || "Untitled Challenge",
    difficulty: (raw.difficulty as Difficulty) || "Easy",
    points: raw.maxScore ?? 100,
    timeLimitMs: raw.timeLimitMs || 4000,
    memoryLimitMb: raw.memoryLimitMb || 256,
    statement: raw.statement || "",
    constraints: raw.constraints || "",
    samples: Array.isArray(raw.samples)
      ? raw.samples.map((s) => ({
          id: s.id,
          ordinal: s.ordinal,
          input: s.input || "",
          output: s.output || "",
          explanation: s.explanation,
        }))
      : [],
    subtasks: [],
  };
}

export async function listProblemsAction(): Promise<{
  problems: Problem[];
  progress: ChallengeProgressMap;
}> {
  try {
    const res = await backendFetch("/api/v1/problems");
    if (res.ok) {
      const data = await res.json();
      const problems = Array.isArray(data.problems)
        ? data.problems.map(mapToProblem)
        : [];
      const progress = (data.progress || {}) as ChallengeProgressMap;
      return { problems, progress };
    }
  } catch (err: unknown) {
    console.error("Failed to list problems:", err);
  }
  return { problems: [], progress: {} };
}

export async function getProblemAction(slug: string): Promise<Problem | null> {
  try {
    const res = await backendFetch(`/api/v1/problems/${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.problem) {
        return mapToProblem(data.problem);
      }
    }
  } catch (err: unknown) {
    console.error(`Failed to fetch problem ${slug}:`, err);
  }
  return null;
}
