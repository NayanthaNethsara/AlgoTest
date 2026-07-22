"use client";

import Editor, { type Monaco } from "@monaco-editor/react";

type CodeEditorProps = {
  language: string;
  value: string;
  onChange: (value: string) => void;
};

function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme("mini-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1a1b21",
      "editorGutter.background": "#1a1b21",
      "editorLineNumber.foreground": "#4b4e5a",
      "editorLineNumber.activeForeground": "#9ea2b0",
    },
  });
}

export function CodeEditor({ language, value, onChange }: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      beforeMount={defineTheme}
      theme="mini-dark"
      loading={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}
      options={{
        fontSize: 14,
        fontFamily: "var(--font-mono)",
        fontLigatures: true,
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        tabSize: 4,
        renderLineHighlight: "line",
        padding: { top: 12, bottom: 12 },
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
