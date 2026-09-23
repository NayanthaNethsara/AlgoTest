"use client";

import React, { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import type { SyntaxItem } from "@/lib/docs/types";
import { cn } from "@/lib/utils";

interface DocsSyntaxCardProps {
  item: SyntaxItem;
}

export function DocsSyntaxCard({ item }: DocsSyntaxCardProps) {
  const [isCopied, setIsCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(item.syntax);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div
      id={item.id}
      className="pixel-raised bg-card p-4 sm:p-5 space-y-3 scroll-mt-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b-2 border-border/50 pb-2.5">
        <h3 className="text-sm sm:text-[15px] font-bold text-foreground font-mono">
          {item.name}
        </h3>
        <span className="text-[11px] text-muted-foreground font-mono">
          #{item.id}
        </span>
      </div>

      <p className="text-xs sm:text-[13px] text-muted-foreground font-mono leading-relaxed">
        {item.description}
      </p>

      {/* Syntax Code Container */}
      <div className="relative group">
        <div className="flex items-center justify-between bg-black/85 px-3 py-1.5 text-[11px] font-mono text-muted-foreground border-t-2 border-x-2 border-black">
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span>Syntax</span>
          </div>

          <button
            type="button"
            onClick={copyCode}
            className={cn(
              "flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-mono transition-colors cursor-pointer select-none",
              isCopied
                ? "bg-primary text-primary-foreground font-bold"
                : "hover:bg-white/10 text-muted-foreground hover:text-foreground",
            )}
          >
            {isCopied ? (
              <>
                <Check className="h-3 w-3" />
                <span>COPIED</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>COPY</span>
              </>
            )}
          </button>
        </div>

        <pre className="pixel-inset bg-black/95 p-3.5 text-xs sm:text-[13px] font-mono text-emerald-300 overflow-x-auto leading-relaxed border-2 border-black">
          <code>{item.syntax}</code>
        </pre>
      </div>

      {item.notes && item.notes.length > 0 && (
        <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground font-mono pt-1">
          {item.notes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
