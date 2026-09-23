"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, KeyRoundIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadTextFile } from "@/lib/file-utils";

type Credential = { username: string; password: string; teamName?: string };

function toTsv(credentials: Credential[]) {
  return credentials
    .map((c) =>
      c.teamName ? `${c.username}\t${c.teamName}\t${c.password}` : `${c.username}\t${c.password}`
    )
    .join("\n");
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Generated passwords are shown exactly once, so this panel stays put until the
 * organizer explicitly dismisses it and offers both clipboard and file exits.
 */
export function CredentialsAlert({
  credentials,
  onClear,
}: {
  credentials: Credential[];
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (credentials.length === 0) return null;

  async function handleCopyAll() {
    const formatted = toTsv(credentials);
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`${credentials.length} credential(s) copied`);
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Use “Download CSV” instead — the browser blocked clipboard access.",
      });
    }
  }

  function handleDownload() {
    const rows = [
      ["username", "team", "password"],
      ...credentials.map((c) => [c.username, c.teamName ?? "", c.password]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const filename = `labyrithm-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  }

  return (
    <section
      aria-label="Generated credentials"
      className="rounded-xl border border-success/30 bg-success/5 p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-success uppercase">
          <KeyRoundIcon className="size-3.5" />
          Generated credentials ({credentials.length})
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={handleCopyAll} className="gap-1">
            {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
            {copied ? "Copied" : "Copy all"}
          </Button>
          <Button variant="outline" size="xs" onClick={handleDownload} className="gap-1">
            <DownloadIcon /> CSV
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClear}
            aria-label="Dismiss generated credentials"
          >
            <XIcon />
          </Button>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        These passwords are shown once. Copy or download them before dismissing this panel.
      </p>

      <div className="max-h-40 overflow-y-auto">
        <ul className="space-y-1 pr-2 font-mono text-xs">
          {credentials.map((c) => (
            <li
              key={`${c.username}-${c.password}`}
              className="flex items-center gap-2 border-b border-success/15 py-1 last:border-b-0"
            >
              <span className="truncate font-medium">{c.username}</span>
              {c.teamName && (
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                  {c.teamName}
                </Badge>
              )}
              <span className="ml-auto shrink-0 font-bold select-all">{c.password}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
