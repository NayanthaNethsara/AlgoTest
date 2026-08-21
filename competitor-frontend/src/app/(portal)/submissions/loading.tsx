import { History } from "lucide-react";

export default function SubmissionsLoading() {
  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">
            Submission History
          </h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Log of recent attempts and system evaluation results.
        </p>
      </div>

      <div className="h-11 pixel-flat bg-card animate-pulse" />

      <div className="pixel-raised bg-card overflow-hidden divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse bg-muted/30" style={{ animationDelay: `${i * 75}ms` }} />
        ))}
      </div>
    </div>
  );
}
