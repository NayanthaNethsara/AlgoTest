"use client";

import { useState } from "react";
import { createSubmission, getSubmission, type SubmissionResult } from "@/lib/api";

const LANGUAGES = ["go", "python", "javascript"];

export function SubmissionForm() {
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const { id } = await createSubmission(language, code);
      setResult(await pollUntilSettled(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="w-40 rounded border border-black/20 px-3 py-2 dark:border-white/20"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your solution here"
        required
        rows={12}
        className="rounded border border-black/20 p-3 font-mono text-sm dark:border-white/20"
      />

      <button
        type="submit"
        disabled={submitting}
        className="w-32 rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {submitting ? "Judging…" : "Submit"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="text-sm">
          <span className="font-medium">{result.status}</span> — {result.output}
        </p>
      )}
    </form>
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
