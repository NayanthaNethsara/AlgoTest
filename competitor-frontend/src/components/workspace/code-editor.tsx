"use client";

import { useRef } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import type { editor, Position } from "monaco-editor";
import { useChallengeTheme } from "@/components/problem/challenge-theme-provider";

loader.config({ paths: { vs: "/monaco/vs" } });

export type EditorTelemetry = {
  typedCount: number;
  pasteCount: number;
  pastedChars: number;
  maxPasteSize: number;
};

type CodeEditorProps = {
  language: string;
  value: string;
  onChange: (value: string) => void;
  onTelemetryChange?: (telemetry: EditorTelemetry) => void;
};

const PALETTE = {
  bg: "#0e1614",
  gutter: "#111a17",
  surface: "#182622",
  edge: "#000000",
  fg: "#e6f4f0",
  muted: "#8caaa2",
  dim: "#3f5d54",
  emerald: "#34d399",
  emeraldDeep: "#10b981",
  gold: "#fbbf24",
  diamond: "#67e8f9",
  amethyst: "#c4b5fd",
  redstone: "#f87171",
} as const;

const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  cpp: "auto bool break case char class const continue default do double else enum false float for if int long namespace private protected public return short signed sizeof static string struct switch true unsigned using vector void while".split(
    " ",
  ),
  c: "auto break case char const continue default do double else enum extern float for if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while".split(
    " ",
  ),
  java: "abstract boolean break byte case catch char class const continue default do double else enum extends false final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true try void while".split(
    " ",
  ),
  python: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(
    " ",
  ),
  javascript: "async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof undefined var void while yield".split(
    " ",
  ),
  rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(
    " ",
  ),
};

const LANGUAGE_SNIPPETS: Record<
  string,
  Array<{ label: string; detail: string; insertText: string }>
> = {
  cpp: [
    { label: "for loop", detail: "Indexed for loop", insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${0}\n}" },
    { label: "cout", detail: "Print a value", insertText: "cout << ${1:value} << '\\n';" },
    { label: "vector", detail: "Declare a vector", insertText: "vector<${1:int}> ${2:values};" },
  ],
  c: [
    { label: "for loop", detail: "Indexed for loop", insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${0}\n}" },
    { label: "printf", detail: "Print a value", insertText: 'printf("${1:%d}\\n", ${2:value});' },
    { label: "scanf", detail: "Read a value", insertText: 'scanf("${1:%d}", &${2:value});' },
  ],
  java: [
    { label: "for loop", detail: "Indexed for loop", insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}" },
    { label: "println", detail: "Print a line", insertText: "System.out.println(${1:value});" },
  ],
  python: [
    { label: "for range", detail: "Range loop", insertText: "for ${1:i} in range(${2:n}):\n\t${0}" },
    { label: "list comprehension", detail: "Create a list", insertText: "[${1:value} for ${2:item} in ${3:items}]" },
  ],
  javascript: [
    { label: "for loop", detail: "Indexed for loop", insertText: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}" },
    { label: "console.log", detail: "Print a value", insertText: "console.log(${1:value});" },
  ],
  rust: [
    { label: "for range", detail: "Range loop", insertText: "for ${1:i} in 0..${2:n} {\n\t${0}\n}" },
    { label: "println!", detail: "Print a line", insertText: 'println!("${1:{}}", ${2:value});' },
  ],
};

let completionsRegistered = false;

function registerCompletions(monaco: Monaco) {
  if (completionsRegistered) return;
  completionsRegistered = true;

  for (const [language, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems(model: editor.ITextModel, position: Position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const keywordSuggestions = keywords.map((keyword) => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
        }));
        const snippetSuggestions = (LANGUAGE_SNIPPETS[language] ?? []).map(
          (snippet) => ({
            label: snippet.label,
            detail: snippet.detail,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          }),
        );

        return { suggestions: [...snippetSuggestions, ...keywordSuggestions] };
      },
    });
  }
}

function defineTheme(monaco: Monaco) {
  registerCompletions(monaco);
  monaco.editor.defineTheme("mini-pixel", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: PALETTE.fg.slice(1) },
      { token: "comment", foreground: "5d7d74", fontStyle: "italic" },
      { token: "keyword", foreground: PALETTE.emerald.slice(1) },
      { token: "keyword.control", foreground: PALETTE.emerald.slice(1) },
      { token: "keyword.operator", foreground: PALETTE.muted.slice(1) },
      { token: "operator", foreground: PALETTE.muted.slice(1) },
      { token: "delimiter", foreground: PALETTE.muted.slice(1) },
      { token: "string", foreground: PALETTE.gold.slice(1) },
      { token: "string.escape", foreground: PALETTE.redstone.slice(1) },
      { token: "number", foreground: PALETTE.diamond.slice(1) },
      { token: "constant", foreground: PALETTE.redstone.slice(1) },
      { token: "type", foreground: "a5f3fc" },
      { token: "type.identifier", foreground: "a5f3fc" },
      { token: "namespace", foreground: "a5f3fc" },
      { token: "function", foreground: PALETTE.fg.slice(1) },
      { token: "identifier", foreground: PALETTE.fg.slice(1) },
      { token: "variable", foreground: PALETTE.fg.slice(1) },
      { token: "variable.predefined", foreground: PALETTE.redstone.slice(1) },
      { token: "metatag", foreground: PALETTE.amethyst.slice(1) },
      { token: "keyword.directive", foreground: PALETTE.amethyst.slice(1) },
      { token: "annotation", foreground: PALETTE.amethyst.slice(1) },
      { token: "tag", foreground: PALETTE.emerald.slice(1) },
      { token: "attribute.name", foreground: PALETTE.diamond.slice(1) },
      { token: "attribute.value", foreground: PALETTE.gold.slice(1) },
      { token: "invalid", foreground: PALETTE.redstone.slice(1) },
    ],
    colors: {
      "editor.background": PALETTE.bg,
      "editor.foreground": PALETTE.fg,
      "editorGutter.background": PALETTE.gutter,
      "editorLineNumber.foreground": PALETTE.dim,
      "editorLineNumber.activeForeground": PALETTE.emerald,
      "editor.lineHighlightBackground": "#16211d",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#10b98159",
      "editor.inactiveSelectionBackground": "#10b9812e",
      "editor.selectionHighlightBackground": "#10b9812e",
      "editor.wordHighlightBackground": "#10b9812e",
      "editorCursor.foreground": PALETTE.emerald,
      "editorWhitespace.foreground": "#24382f",
      "editorIndentGuide.background1": "#1c2a26",
      "editorIndentGuide.activeBackground1": "#2f4d44",
      "editorBracketMatch.background": "#10b98133",
      "editorBracketMatch.border": PALETTE.emerald,
      "editor.findMatchBackground": "#f59e0b66",
      "editor.findMatchHighlightBackground": "#f59e0b33",
      "scrollbarSlider.background": "#2f4d4499",
      "scrollbarSlider.hoverBackground": "#3f5d54cc",
      "scrollbarSlider.activeBackground": PALETTE.emeraldDeep,
      "editorOverviewRuler.border": PALETTE.edge,
      "editorWidget.background": PALETTE.surface,
      "editorWidget.border": PALETTE.edge,
      "editorSuggestWidget.background": PALETTE.surface,
      "editorSuggestWidget.border": PALETTE.edge,
      "editorSuggestWidget.selectedBackground": "#2f4d44",
      "editorSuggestWidget.highlightForeground": PALETTE.emerald,
      "editorHoverWidget.background": PALETTE.surface,
      "editorHoverWidget.border": PALETTE.edge,
      "editorError.foreground": PALETTE.redstone,
      "editorWarning.foreground": PALETTE.gold,
    },
  });
}

export function CodeEditor({ language, value, onChange, onTelemetryChange }: CodeEditorProps) {
  const { mode } = useChallengeTheme();
  const editorTheme = mode === "light" ? "vs" : "mini-pixel";

  const telemetryRef = useRef<EditorTelemetry>({
    typedCount: 0,
    pasteCount: 0,
    pastedChars: 0,
    maxPasteSize: 0,
  });

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      onMount={(editor) => {
        editor.onKeyDown((e) => {
          if (e.browserEvent.key && e.browserEvent.key.length === 1) {
            telemetryRef.current.typedCount += 1;
            onTelemetryChange?.({ ...telemetryRef.current });
          }
        });

        editor.onDidPaste((e) => {
          const text = editor.getModel()?.getValueInRange(e.range) ?? "";
          const len = text.length;
          telemetryRef.current.pasteCount += 1;
          telemetryRef.current.pastedChars += len;
          if (len > telemetryRef.current.maxPasteSize) {
            telemetryRef.current.maxPasteSize = len;
          }
          onTelemetryChange?.({ ...telemetryRef.current });
        });
      }}
      beforeMount={defineTheme}
      theme={editorTheme}
      loading={
        <div className="pixel-label animate-pulse p-4">Loading editor…</div>
      }
      options={{
        fontSize: 14,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontLigatures: true,
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 4,
        renderLineHighlight: "line",
        padding: { top: 12, bottom: 12 },
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
        cursorStyle: "line",
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true,
        roundedSelection: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        snippetSuggestions: "top",
      }}
    />
  );
}
