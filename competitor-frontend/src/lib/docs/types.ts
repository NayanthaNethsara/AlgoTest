export type LanguageSlug =
  | "cpp"
  | "python"
  | "java"
  | "rust"
  | "c"
  | "javascript"
  | "algorithms";

export interface SyntaxItem {
  id: string;
  name: string;
  syntax: string;
  description: string;
  notes?: string[];
}

export interface DocTopic {
  id: string;
  title: string;
  summary: string;
  items: SyntaxItem[];
}

export interface LanguageDoc {
  slug: LanguageSlug;
  name: string;
  version: string;
  iconName: "cpp" | "python" | "java" | "rust" | "c" | "javascript" | "algorithms";
  summary: string;
  topics: DocTopic[];
}
