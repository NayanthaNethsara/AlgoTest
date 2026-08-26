import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

export default function ChallengesLoading() {
  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7 font-mono">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-1 border-b-2 border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-5 w-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              Competition Challenges
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Solve problems and earn points to climb the leaderboard.
          </p>
        </div>

        {/* Challenge Filter & Search Skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
          <div className="h-8 w-full max-w-sm pixel-inset bg-muted/40 animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-7 w-32 pixel-flat bg-muted/40 animate-pulse" />
            <div className="h-7 w-32 pixel-flat bg-muted/40 animate-pulse" />
          </div>
        </div>

        {/* Challenge Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="pixel-raised bg-card p-5 flex flex-col justify-between gap-4 h-48 animate-pulse"
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-muted" />
                  <div className="h-5 w-14 bg-muted/60" />
                </div>
                <div className="h-5 w-3/4 bg-muted/80" />
                <div className="h-3.5 w-full bg-muted/40" />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="h-4 w-20 bg-muted/40" />
                <div className="h-6 w-16 bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
