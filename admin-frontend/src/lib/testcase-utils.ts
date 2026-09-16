import { downloadTextFile } from "./file-utils";
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

export interface PairedTestFiles {
  baseName: string;
  inputFile: File;
  expectedFile: File;
  totalSize: number;
}

export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Generates an even distribution of points matching backend logic.
 */
export function generateEvenPoints(count: number, maxScore: number): number[] {
  if (count <= 0 || maxScore <= 0) return [];
  const base = Math.floor(maxScore / count);
  const remainder = maxScore % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Summary calculations for points and distribution.
 */
export function calculateScoringSummary(tests: { points?: number }[], maxScore: number) {
  const customPointsSum = tests.reduce((sum, t) => sum + (Number(t.points) || 0), 0);
  const autoPointPerTest = tests.length > 0 ? Math.floor(maxScore / tests.length) : 0;

  const isEvenDistribution =
    tests.length === 0 ||
    tests.every((t) => Number(t.points) === 0) ||
    (customPointsSum === maxScore &&
      tests.every((t, i) => {
        const base = Math.floor(maxScore / tests.length);
        const rem = maxScore % tests.length;
        const expected = base + (i < rem ? 1 : 0);
        return Number(t.points) === expected;
      }));

  const hasCustomPoints = !isEvenDistribution;

  return {
    customPointsSum,
    hasCustomPoints,
    autoPointPerTest,
    hasMinimumCases: tests.length >= MIN_EVALUATION_TEST_CASES,
  };
}

/**
 * Matches input/output file pairs without loading full contents into memory.
 */
export function matchTestFilePairs(files: File[]): {
  pairs: PairedTestFiles[];
  unmatched: string[];
} {
  if (files.length === 0) {
    return { pairs: [], unmatched: [] };
  }

  const groups = new Map<string, { key: string; input?: File; expected?: File; sortKey: number }>();

  function normalizeKey(filename: string) {
    const lower = filename.toLowerCase();
    const isInput = lower.includes("in") && !lower.includes("out") && !lower.includes("ans");
    const isOutput = lower.includes("out") || lower.includes("ans") || lower.includes("expected");

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

  const pairs: PairedTestFiles[] = [];
  const unmatched: string[] = [];

  for (const group of sortedGroups) {
    if (group.input && group.expected) {
      pairs.push({
        baseName: group.key,
        inputFile: group.input,
        expectedFile: group.expected,
        totalSize: group.input.size + group.expected.size,
      });
    } else {
      if (group.input) unmatched.push(group.input.name);
      if (group.expected) unmatched.push(group.expected.name);
    }
  }

  return { pairs, unmatched };
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

export interface HeadTailPreview {
  isTruncated: boolean;
  totalLines: number;
  totalBytes: number;
  headLinesCount: number;
  tailLinesCount: number;
  omittedLines: number;
  headText: string;
  tailText: string;
  fullText: string;
}

export function formatHeadTailPreview(
  text: string,
  headLines = 25,
  tailLines = 25
): HeadTailPreview {
  const str = text || "";
  const lines = str.split("\n");
  const totalLines = lines.length;
  const totalBytes = new Blob([str]).size;

  if (totalLines <= headLines + tailLines && totalBytes <= 4096) {
    return {
      isTruncated: false,
      totalLines,
      totalBytes,
      headLinesCount: totalLines,
      tailLinesCount: 0,
      omittedLines: 0,
      headText: str,
      tailText: "",
      fullText: str,
    };
  }

  const headSlice = lines.slice(0, headLines);
  const tailSlice = lines.slice(Math.max(headLines, totalLines - tailLines));
  const omittedLines = Math.max(0, totalLines - headSlice.length - tailSlice.length);

  return {
    isTruncated: true,
    totalLines,
    totalBytes,
    headLinesCount: headSlice.length,
    tailLinesCount: tailSlice.length,
    omittedLines,
    headText: headSlice.join("\n"),
    tailText: tailSlice.join("\n"),
    fullText: str,
  };
}

export async function readFileHeadTail(
  file: File,
  headBytes = 2048,
  tailBytes = 2048
): Promise<{
  headText: string;
  tailText: string;
  isTruncated: boolean;
  totalSize: number;
}> {
  if (file.size <= headBytes + tailBytes) {
    const fullText = await file.text();
    return {
      headText: fullText,
      tailText: "",
      isTruncated: false,
      totalSize: file.size,
    };
  }

  const headBlob = file.slice(0, headBytes);
  const tailBlob = file.slice(Math.max(0, file.size - tailBytes), file.size);

  const [headText, tailText] = await Promise.all([headBlob.text(), tailBlob.text()]);

  return {
    headText,
    tailText,
    isTruncated: true,
    totalSize: file.size,
  };
}

export function downloadSampleTestCaseFiles(): void {
  const sampleInput = "5\n1 2 3 4 5\n";
  const sampleExpected = "15\n";

  downloadTextFile("01.in", sampleInput);
  setTimeout(() => {
    downloadTextFile("01.out", sampleExpected);
  }, 200);
}

