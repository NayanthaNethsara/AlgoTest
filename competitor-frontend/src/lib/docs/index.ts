import { CPP_DOC } from "./cpp";
import { PYTHON_DOC } from "./python";
import { JAVA_DOC } from "./java";
import { RUST_DOC } from "./rust";
import { C_DOC } from "./c";
import { JAVASCRIPT_DOC } from "./javascript";
import { ALGORITHMS_DOC } from "./algorithms";
import type { LanguageDoc } from "./types";

export const DOC_LANGUAGES: LanguageDoc[] = [
  CPP_DOC,
  PYTHON_DOC,
  JAVA_DOC,
  RUST_DOC,
  C_DOC,
  JAVASCRIPT_DOC,
  ALGORITHMS_DOC,
];

export function getLanguageDoc(slug: string): LanguageDoc | undefined {
  const normalized = slug.toLowerCase();
  if (normalized === "cpp" || normalized === "c++") return CPP_DOC;
  if (normalized === "python" || normalized === "py") return PYTHON_DOC;
  if (normalized === "java") return JAVA_DOC;
  if (normalized === "rust" || normalized === "rs") return RUST_DOC;
  if (normalized === "c") return C_DOC;
  if (normalized === "javascript" || normalized === "js" || normalized === "node")
    return JAVASCRIPT_DOC;
  if (normalized === "algorithms" || normalized === "algo") return ALGORITHMS_DOC;
  return undefined;
}

export * from "./types";
