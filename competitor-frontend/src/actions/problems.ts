"use server";

import { backendFetch } from "@/lib/api/server";
import type { ChallengeProgressMap } from "@/types/challenge";
import type { Difficulty, Problem, Sample } from "@/types/problem";

type BackendProblemResponse = {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  statement: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxScore: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  testCount: number;
  samples?: Sample[];
};

function mapToProblem(raw: BackendProblemResponse): Problem {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    difficulty: raw.difficulty,
    points: raw.maxScore,
    timeLimitMs: raw.timeLimitMs,
    memoryLimitMb: raw.memoryLimitMb,
    statement: raw.statement,
    constraints: raw.constraints,
    samples: raw.samples ?? [],
  };
}

export async function listProblemsAction(): Promise<{
  problems: Problem[];
  progress: ChallengeProgressMap;
}> {
  try {
    const res = await backendFetch("/api/v1/problems");
    if (!res.ok) {
      return { problems: [], progress: {} };
    }
    const data = (await res.json()) as {
      problems?: BackendProblemResponse[];
      progress?: ChallengeProgressMap;
    };
    return {
      problems: (data.problems ?? []).map(mapToProblem),
      progress: data.progress ?? {},
    };
  } catch (err: unknown) {
    console.error("Failed to list problems:", err);
    return { problems: [], progress: {} };
  }
}

export async function getProblemAction(slug: string): Promise<Problem | null> {
  try {
    const res = await backendFetch(
      `/api/v1/problems/${encodeURIComponent(slug)}`,
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { problem?: BackendProblemResponse };
    if (!data.problem) {
      return null;
    }
    return mapToProblem(data.problem);
  } catch (err: unknown) {
    console.error(`Failed to get problem ${slug}:`, err);
    return null;
  }
}
