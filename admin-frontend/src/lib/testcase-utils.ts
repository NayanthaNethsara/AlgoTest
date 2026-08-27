import type { Sample, TestCaseInput } from "@/types/problem";

export const MIN_EVALUATION_TEST_CASES = 5;

/**
 * Finds a public sample that exactly matches the input and expected output of an evaluation test case.
 */
export function findMatchingSample(testCase: TestCaseInput, samples: Sample[]): Sample | undefined {
  const testInput = testCase.input.trim();
  const testExpected = testCase.expected.trim();
  if (!testInput || !testExpected) return undefined;

  return samples.find(
    (sample) => sample.input.trim() === testInput && sample.output.trim() === testExpected
  );
}

/**
 * Parses raw JSON array or delimiter blocks into TestCaseInput array.
 */
export function parseBulkTestCases(
  rawText: string,
  existingCount: number = 0
): { testCases: TestCaseInput[]; error?: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { testCases: [] };
  }

  // 1. Try parsing standard JSON array
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const testCases: TestCaseInput[] = parsed.map((item, idx) => ({
        ordinal: existingCount + idx + 1,
        input: String(item.input ?? item.in ?? ""),
        expected: String(item.expected ?? item.output ?? item.out ?? ""),
        points: Number(item.points) || 0,
      }));
      return { testCases };
    }
  } catch {
    // 2. Fallback to delimiter block parser (=== INPUT === ... === OUTPUT ===)
    const rawSegments = trimmed.split(/(?:^|\n)===\s*(?:INPUT|OUTPUT|EXPECTED)\s*===/i);
    const cleaned = rawSegments.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length >= 2) {
      const pairs: TestCaseInput[] = [];
      for (let i = 0; i < cleaned.length; i += 2) {
        if (cleaned[i] && cleaned[i + 1]) {
          pairs.push({
            ordinal: existingCount + pairs.length + 1,
            input: cleaned[i],
            expected: cleaned[i + 1],
            points: 0,
          });
        }
      }
      if (pairs.length > 0) {
        return { testCases: pairs };
      }
    }
  }

  return {
    testCases: [],
    error:
      'Could not parse test cases. Please provide a valid JSON array (e.g. [{"input":"5","expected":"15"}]) or use delimiter blocks.',
  };
}

/**
 * Summary calculations for points and distribution.
 */
export function calculateScoringSummary(tests: TestCaseInput[], maxScore: number) {
  const customPointsSum = tests.reduce((sum, t) => sum + (Number(t.points) || 0), 0);
  const hasCustomPoints = tests.some((t) => Number(t.points) > 0);
  const autoPointPerTest = tests.length > 0 ? Math.floor(maxScore / tests.length) : 0;

  return {
    customPointsSum,
    hasCustomPoints,
    autoPointPerTest,
    hasMinimumCases: tests.length >= MIN_EVALUATION_TEST_CASES,
  };
}

/**
 * Matches and reads input/output file pairs (e.g. t1in.txt & t1out.txt, 1.in & 1.out).
 */
export async function parseFilePairs(
  files: File[],
  existingCount: number = 0
): Promise<{ testCases: TestCaseInput[]; unmatched: string[]; error?: string }> {
  if (files.length === 0) {
    return { testCases: [], unmatched: [] };
  }

  const groups = new Map<string, { key: string; input?: File; expected?: File; sortKey: number }>();

  function normalizeKey(filename: string) {
    const lower = filename.toLowerCase();
    const isInput =
      lower.includes("in") && !lower.includes("out") && !lower.includes("ans");
    const isOutput =
      lower.includes("out") || lower.includes("ans") || lower.includes("expected");

    const numMatch = lower.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : 999999;

    let base = lower
      .replace(/\.(txt|in|out|ans|dat)$/i, "")
      .replace(/(?:^|[._-])(input|output|expected|answer|in|out|ans)(?:[._-]|$)/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!base && numMatch) {
      base = `case_${numMatch[0]}`;
    } else if (!base) {
      base = filename;
    }

    return { base, isInput, isOutput, num };
  }

  for (const file of files) {
    const { base, isInput, isOutput, num } = normalizeKey(file.name);
    if (!groups.has(base)) {
      groups.set(base, { key: base, sortKey: num });
    }
    const entry = groups.get(base)!;
    if (isInput && !entry.input) {
      entry.input = file;
    } else if (isOutput && !entry.expected) {
      entry.expected = file;
    } else if (!entry.input) {
      entry.input = file;
    } else if (!entry.expected) {
      entry.expected = file;
    }
  }

  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => a.sortKey - b.sortKey || a.key.localeCompare(b.key)
  );
  const testCases: TestCaseInput[] = [];
  const unmatched: string[] = [];

  for (const group of sortedGroups) {
    if (group.input && group.expected) {
      const [inputText, expectedText] = await Promise.all([
        group.input.text(),
        group.expected.text(),
      ]);
      testCases.push({
        ordinal: existingCount + testCases.length + 1,
        input: inputText,
        expected: expectedText,
        points: 0,
      });
    } else {
      if (group.input) unmatched.push(group.input.name);
      if (group.expected) unmatched.push(group.expected.name);
    }
  }

  return { testCases, unmatched };
}

/**
 * Calculates byte size and line count for a testcase payload.
 */
export function getTextStats(text: string) {
  const str = text || "";
  const lines = str ? str.split("\n").length : 0;
  const bytes = new Blob([str]).size;
  const formattedSize =
    bytes > 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : bytes > 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${bytes} B`;
  return { lines, bytes, formattedSize };
}

/**
 * Creates a clean single-line snippet preview for collapsed testcases.
 */
export function getTextSnippet(text: string, maxLength: number = 45): string {
  if (!text || !text.trim()) return "(empty)";
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength)}...`;
}

