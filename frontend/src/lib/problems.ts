import type { Problem } from "@/types/problem";

export const SAMPLE_PROBLEM: Problem = {
  id: "range-sum",
  title: "Range Sum Queries",
  difficulty: "Medium",
  points: 100,
  timeLimitMs: 1000,
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
  subtasks: [
    { id: 1, points: 25, constraints: "$N, Q \\le 1000$" },
    { id: 2, points: 35, constraints: "$N, Q \\le 10^5$, all $a_i \\ge 0$" },
    { id: 3, points: 40, constraints: "No additional constraints" },
  ],
};

const TWO_SUM: Problem = {
  id: "two-sum-count",
  title: "Two Sum Count",
  difficulty: "Easy",
  points: 50,
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  statement: `Given an array of $N$ integers and a target $T$, count the number of pairs
$(i, j)$ with $i < j$ such that $a_i + a_j = T$.`,
  constraints: `- $1 \\le N \\le 2 \\times 10^5$
- $-10^9 \\le a_i, T \\le 10^9$`,
  samples: [
    {
      input: "4 6\n1 5 3 2",
      output: "2",
      explanation: "Pairs $(1,5)$ and $(3, \\text{n/a})$... $1+5=6$ and $4$ not present.",
    },
  ],
  subtasks: [
    { id: 1, points: 40, constraints: "$N \\le 2000$" },
    { id: 2, points: 60, constraints: "No additional constraints" },
  ],
};

const LONGEST_PREFIX: Problem = {
  id: "longest-common-prefix",
  title: "Longest Common Prefix",
  difficulty: "Easy",
  points: 30,
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  statement: `Given $N$ lowercase strings, find the length of their longest common prefix.`,
  constraints: `- $1 \\le N \\le 10^5$
- Total length of all strings $\\le 10^6$`,
  samples: [
    {
      input: "3\nflower\nflow\nflight",
      output: "2",
    },
  ],
  subtasks: [],
};

const PROBLEMS: Problem[] = [SAMPLE_PROBLEM, TWO_SUM, LONGEST_PREFIX];

export function listProblems(): Problem[] {
  return PROBLEMS;
}

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((problem) => problem.id === id);
}
