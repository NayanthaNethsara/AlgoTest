import { History } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SubmissionsLoading() {
  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7 font-mono">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-1 border-b-2 border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              Submission History
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Log of recent attempts and system evaluation results.
          </p>
        </div>

        {/* Filter Controls Skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
          <div className="h-8 w-full max-w-sm pixel-inset bg-muted/40 animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-7 w-48 pixel-flat bg-muted/40 animate-pulse" />
            <div className="h-7 w-32 pixel-flat bg-muted/40 animate-pulse" />
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="pixel-raised bg-card overflow-hidden">
          <div className="border-b-2 border-black bg-muted/80 p-3.5 flex items-center justify-between">
            <div className="h-4 w-24 bg-muted animate-pulse" />
            <div className="h-4 w-28 bg-muted animate-pulse" />
            <div className="h-4 w-20 bg-muted animate-pulse" />
            <div className="h-4 w-16 bg-muted animate-pulse" />
            <div className="h-4 w-20 bg-muted animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="p-4 flex items-center justify-between gap-4 animate-pulse"
              >
                <div className="h-4 w-1/4 bg-muted/60" />
                <div className="h-4 w-1/5 bg-muted/50" />
                <div className="h-4 w-16 bg-muted/40" />
                <div className="h-4 w-20 bg-muted/50" />
                <div className="h-4 w-16 bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
