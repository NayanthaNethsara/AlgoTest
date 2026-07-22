"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSubmission, getSubmission, type SubmissionResult } from "@/lib/api";
import { LANGUAGES } from "@/lib/languages";

export function SubmissionForm() {
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [code, setCode] = useState(LANGUAGES[0].starter);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleLanguageChange(id: string | null) {
    const next = LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0];
    setLanguage(next);
    setCode(next.starter);
    setResult(null);
    setError(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const { id } = await createSubmission(language.id, code);
      setResult(await pollUntilSettled(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <Select value={language.id} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Judging…" : "Run"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
        <CodeEditor language={language.id} value={code} onChange={setCode} />
      </div>

      <ResultPanel result={result} error={error} />
    </div>
  );
}

function ResultPanel({
  result,
  error,
}: {
  result: SubmissionResult | null;
  error: string | null;
}) {
  if (!error && !result) return null;

  return (
    <div className="rounded-lg border p-4 font-mono text-sm">
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <p>
          <span className="font-semibold">{result!.status}</span> — {result!.output}
        </p>
      )}
    </div>
  );
}

async function pollUntilSettled(id: string): Promise<SubmissionResult> {
  for (;;) {
    const result = await getSubmission(id);
    if (result.status !== "queued" && result.status !== "running") {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
