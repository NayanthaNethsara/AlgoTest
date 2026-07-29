"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Credential = { username: string; password: string };

export function CredentialsAlert({
  credentials,
  onClear,
}: {
  credentials: Credential[];
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (credentials.length === 0) return null;

  function handleCopyAll() {
    const formatted = credentials.map((c) => `${c.username}\t${c.password}`).join("\n");
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border bg-green-500/10 p-4 border-green-500/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
          Generated Credentials ({credentials.length})
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyAll} className="h-6 text-[11px] gap-1">
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied!" : "Copy All"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 text-[11px]">
            Dismiss
          </Button>
        </div>
      </div>
      <div className="font-mono text-xs max-h-36 overflow-y-auto space-y-1">
        {credentials.map((c, i) => (
          <div key={i} className="flex justify-between border-b border-green-500/20 py-1">
            <span>{c.username}</span>
            <span className="font-bold select-all">{c.password}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
