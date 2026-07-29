import type { Problem, Difficulty } from "@/types/problem";
import { backendFetch } from "@/lib/api/server";

export const SAMPLE_PROBLEM: Problem = {
  id: "range-sum",
  title: "Range Sum Queries",
  difficulty: "Medium",
  points: 100,
  timeLimitMs: 4000,
  memoryLimitMb: 256,
  statement: `You are given an array of $N$ integers $a_1, a_2, \\ldots, a_N$.

Answer $Q$ queries. Each query gives two indices $l$ and $r$ $(1 \\le l \\le r \\le N)$
and asks for the sum of the subarray:

$$\\sum_{i=l}^{r} a_i$$

**Input**

- The first line contains two integers $N$ and $Q$.
- The second line contains $N$ integers $a_1 \\ldots a_N$.
- Each of the next $Q$ lines contains two integers $l$ and $r$.

**Output**

For each query, print the sum on its own line.`,
  constraints: `- $1 \\le N, Q \\le 2 \\times 10^5$
- $-10^9 \\le a_i \\le 10^9$
- $1 \\le l \\le r \\le N$`,
  samples: [
    {
      input: "5 2\n1 2 3 4 5\n1 3\n2 5",
      output: "6\n14",
      explanation: "The first query sums $a_1 + a_2 + a_3 = 6$.",
    },
    {
      input: "3 1\n-1 -2 -3\n1 3",
      output: "-6",
    },
  ],
  subtasks: [],
};

const TWO_SUM: Problem = {
  id: "two-sum-count",
  title: "Two Sum Count",
  difficulty: "Easy",
  points: 50,
  timeLimitMs: 4000,
  memoryLimitMb: 256,
  statement: `Given an array of $N$ integers and a target $T$, count the number of pairs $(i, j)$ with $i < j$ such that $a_i + a_j = T$.`,
  constraints: `- $1 \\le N \\le 2 \\times 10^5$
- $-10^9 \\le a_i, T \\le 10^9$`,
  samples: [
    {
      input: "4 6\n1 5 3 2",
      output: "2",
    },
  ],
  subtasks: [],
};

const STATIC_PROBLEMS: Problem[] = [SAMPLE_PROBLEM, TWO_SUM];

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
  samples?: { input: string; output: string; explanation?: string }[];
};

function mapApiProblem(p: ApiProblem): Problem {
  return {
    id: p.slug,
    title: p.title,
    difficulty: (p.difficulty as Difficulty) || "Easy",
    points: p.maxScore || 100,
    timeLimitMs: p.timeLimitMs || 4000,
    memoryLimitMb: p.memoryLimitMb || 256,
    statement: p.statement || "",
    constraints: p.constraints || "",
    samples: p.samples ?? [],
    subtasks: [],
  };
}

export async function listProblems(): Promise<Problem[]> {
  try {
    const res = await backendFetch("/api/v1/problems");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.problems) && data.problems.length > 0) {
        return data.problems.map(mapApiProblem);
      }
    }
  } catch {
    // Fall back to static problems if API is offline
  }
  return STATIC_PROBLEMS;
}

export async function getProblem(slug: string): Promise<Problem | undefined> {
  try {
    const res = await backendFetch(`/api/v1/problems/${slug}`);
    if (res.ok) {
      const data = await res.json();
      if (data.problem) {
        return mapApiProblem(data.problem);
      }
    }
  } catch {
    // Fall back to static lookup
  }
  return STATIC_PROBLEMS.find((p) => p.id === slug);
}
