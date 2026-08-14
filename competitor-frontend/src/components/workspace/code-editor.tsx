"use client";

import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { useChallengeTheme } from "@/components/providers/challenge-theme-provider";

loader.config({ paths: { vs: "/monaco/vs" } });

type CodeEditorProps = {
  language: string;
  value: string;
  onChange: (value: string) => void;
};

const PALETTE = {
  bg: "#0e1614", // --input: the editor is a surface pressed into the page
  gutter: "#111a17", // --background
  surface: "#182622", // --card
  edge: "#000000",
  fg: "#e6f4f0", // --foreground
  muted: "#8caaa2", // --muted-foreground
  dim: "#3f5d54",
  emerald: "#34d399", // --primary, lightened
  emeraldDeep: "#10b981",
  gold: "#fbbf24",
  diamond: "#67e8f9",
  amethyst: "#c4b5fd",
  redstone: "#f87171",
} as const;

function defineTheme(monaco: Monaco) {
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
      // Hard-edged and opaque enough to read against gold strings.
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
      // Chunky, square, and the same greens as the page scrollbars.
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

export function CodeEditor({ language, value, onChange }: CodeEditorProps) {
  const { mode } = useChallengeTheme();
  const editorTheme =
    mode === "light" ? "vs" : mode === "dark" ? "vs-dark" : "mini-pixel";

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      beforeMount={defineTheme}
      theme={editorTheme}
      loading={
        <div className="pixel-label animate-pulse p-4">Loading editor…</div>
      }
      options={{
        fontSize: 14,
        fontFamily:
          mode === "pixel"
            ? "var(--font-mono), ui-monospace, monospace"
            : "Menlo, Monaco, Consolas, 'Fira Code', var(--font-mono), monospace",
        fontLigatures: mode !== "pixel",
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 4,
        renderLineHighlight: "line",
        padding: { top: 12, bottom: 12 },
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },

        cursorStyle: mode === "pixel" ? "block" : "line",
        cursorBlinking: mode === "pixel" ? "blink" : "smooth",
        cursorSmoothCaretAnimation: mode === "pixel" ? "off" : "on",
        smoothScrolling: mode !== "pixel",
        roundedSelection: mode !== "pixel",
      }}
    />
  );
}
