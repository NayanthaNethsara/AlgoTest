"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 text-center bg-background text-foreground">
      <div className="max-w-md pixel-raised bg-card p-8 flex flex-col items-center gap-4">
        <div className="p-3 bg-destructive/10 text-destructive pixel-flat">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Something Went Wrong</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Could not load the contest page. Please check your connection to the server and retry.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 inline-flex items-center gap-2 pixel-flat bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
