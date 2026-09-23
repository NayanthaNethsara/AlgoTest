"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp, Home, RefreshCw, Wifi } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  const handleRetry = () => {
    setIsRetrying(true);
    reset();
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 sm:p-6 text-center bg-background text-foreground select-none">
      <div className="w-full max-w-lg pixel-raised bg-card p-6 sm:p-8 flex flex-col items-center gap-5">
        <div className="p-3.5 bg-destructive/15 text-destructive pixel-flat">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-mono uppercase">
            Connection or Portal Error
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            The contest interface encountered a problem communicating with the server.
          </p>
        </div>

        <div className="w-full pixel-inset bg-input/60 p-3.5 text-left flex flex-col gap-2 text-xs font-mono text-muted-foreground border border-border">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Wifi className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Troubleshooting Checklist:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
            <li>Ensure you are connected to the venue WiFi / contest network.</li>
            <li>Verify your local proctor agent is running.</li>
            <li>If organizers are updating contest phases, wait a few seconds and retry.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 w-full pt-1">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center justify-center gap-2 pixel-flat bg-primary text-primary-foreground px-4 py-2 text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "pixel-spin" : ""}`} />
            <span>{isRetrying ? "Retrying..." : "Retry Connection"}</span>
          </button>

          <Link
            href="/challenges"
            className="inline-flex items-center justify-center gap-2 pixel-flat bg-muted text-foreground px-4 py-2 text-xs sm:text-sm font-semibold hover:bg-muted/80 transition-colors shrink-0"
          >
            <Home className="h-4 w-4 text-muted-foreground" />
            <span>Challenges Hub</span>
          </Link>
        </div>

        {error?.message && (
          <div className="w-full pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer font-mono"
            >
              <span>{showDetails ? "Hide Technical Details" : "Show Technical Details"}</span>
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showDetails && (
              <pre className="mt-2.5 w-full max-h-36 overflow-auto p-2.5 text-left text-[10px] font-mono text-destructive/90 bg-black/60 border border-destructive/30 whitespace-pre-wrap break-all overscroll-contain">
                {error.message}
                {error.digest ? `\nDigest: ${error.digest}` : ""}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
