import { Trophy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function LeaderboardLoading() {
  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7 font-mono">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-1 border-b-2 border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              Leaderboard
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Real-time rankings sorted by total XP scores and submission speed.
          </p>
        </div>

        {/* Filter Bar Skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
          <div className="h-8 w-full max-w-sm pixel-inset bg-muted/40 animate-pulse" />
          <div className="h-7 w-40 pixel-flat bg-muted/40 animate-pulse" />
        </div>

        {/* Table Skeleton */}
        <div className="pixel-raised bg-card overflow-hidden">
          <div className="border-b-2 border-black bg-muted/80 p-3.5 flex items-center justify-between">
            <div className="h-4 w-12 bg-muted animate-pulse" />
            <div className="h-4 w-32 bg-muted animate-pulse" />
            <div className="h-4 w-16 bg-muted animate-pulse" />
            <div className="h-4 w-20 bg-muted animate-pulse" />
            <div className="h-4 w-24 bg-muted animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="p-3.5 flex items-center justify-between gap-4 animate-pulse"
              >
                <div className="h-6 w-6 bg-muted/50 pixel-flat" />
                <div className="h-4 w-1/3 bg-muted/60" />
                <div className="h-4 w-12 bg-muted/40" />
                <div className="h-4 w-16 bg-muted/50" />
                <div className="h-4 w-20 bg-muted/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
