import { CPP_DOC } from "./cpp";
import { PYTHON_DOC } from "./python";
import { JAVASCRIPT_DOC } from "./javascript";
import type { LanguageDoc } from "./types";

export const DOC_LANGUAGES: LanguageDoc[] = [
  CPP_DOC,
  PYTHON_DOC,
  JAVASCRIPT_DOC,
];

export function getLanguageDoc(slug: string): LanguageDoc | undefined {
  const normalized = slug.toLowerCase();
  if (normalized === "cpp" || normalized === "c++") return CPP_DOC;
  if (normalized === "python" || normalized === "py") return PYTHON_DOC;
  if (normalized === "javascript" || normalized === "js" || normalized === "node")
    return JAVASCRIPT_DOC;
  return undefined;
}

export * from "./types";
