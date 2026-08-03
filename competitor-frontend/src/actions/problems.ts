"use server";

import { backendFetch } from "@/lib/api/server";
import type { Problem, Difficulty } from "@/types/problem";

type ApiSample = {
  id?: string;
  ordinal?: number;
  input: string;
  output: string;
  explanation?: string;
};

type ApiProblem = {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  statement: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxScore: number;
  published: boolean;
  samples?: ApiSample[];
};

function mapApiProblem(p: ApiProblem): Problem {
  return {
    id: p.id || p.slug,
    slug: p.slug || p.id,
    title: p.title,
    difficulty: (p.difficulty as Difficulty) || "Easy",
    points: p.maxScore ?? 100,
    timeLimitMs: p.timeLimitMs || 4000,
    memoryLimitMb: p.memoryLimitMb || 256,
    statement: p.statement || "",
    constraints: p.constraints || "",
    samples: (p.samples || []).map((s) => ({
      id: s.id,
      ordinal: s.ordinal,
      input: s.input || "",
      output: s.output || "",
      explanation: s.explanation || undefined,
    })),
    subtasks: [],
  };
}

export type ChallengeProgressItem = {
  problemId: string;
  bestScore: number;
  status: "solved" | "attempted" | "not_attempted";
};

export type ChallengeProgressMap = Record<string, ChallengeProgressItem>;

export async function listProblemsAction(): Promise<{
  problems: Problem[];
  progress: ChallengeProgressMap;
}> {
  try {
    const res = await backendFetch("/api/v1/problems");
    if (res.ok) {
      const data = await res.json();
      const problems = Array.isArray(data.problems) ? data.problems.map(mapApiProblem) : [];
      const progress = (data.progress || {}) as ChallengeProgressMap;
      return { problems, progress };
    }
  } catch (err: unknown) {
    console.error("Failed to list problems from backend:", err);
  }
  return { problems: [], progress: {} };
}

export async function getProblemAction(slug: string): Promise<Problem | null> {
  try {
    const res = await backendFetch(`/api/v1/problems/${slug}`);
    if (res.ok) {
      const data = await res.json();
      if (data.problem) {
        return mapApiProblem(data.problem);
      }
    }
  } catch (err: unknown) {
    console.error(`Failed to fetch problem ${slug} from backend:`, err);
  }
  return null;
}
