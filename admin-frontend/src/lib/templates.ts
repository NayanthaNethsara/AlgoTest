import type { ProblemInput } from "@/types/problem";

export const STARTER_PROBLEM_TEMPLATE: ProblemInput = {
  slug: "sample-problem",
  title: "Sample Problem Title",
  difficulty: "Easy",
  maxScore: 100,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  published: false,
  statement: `Given an array of integers $A$ of size $N$, find the sum of all elements in the array.

### Input Format
- The first line contains an integer $N$.
- The second line contains $N$ space-separated integers $A_1, A_2, \\dots, A_N$.

### Output Format
- Print a single integer representing the total sum.`,
  constraints: `- $1 \\le N \\le 10^5$
- $-10^9 \\le A_i \\le 10^9$`,
  samples: [
    {
      ordinal: 1,
      input: "5\n1 2 3 4 5",
      output: "15",
      explanation: "1 + 2 + 3 + 4 + 5 = 15",
    },
  ],
};
