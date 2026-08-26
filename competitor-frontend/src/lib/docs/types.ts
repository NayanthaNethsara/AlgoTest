export type LanguageSlug = "cpp" | "python" | "javascript";

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
  iconName: "cpp" | "python" | "javascript";
  summary: string;
  topics: DocTopic[];
}
