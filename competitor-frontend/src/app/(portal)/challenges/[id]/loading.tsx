export default function ChallengeDetailLoading() {
  return (
    <div className="h-full w-full flex flex-col md:flex-row font-mono overflow-hidden">
      {/* Left Problem Panel Skeleton */}
      <div className="w-full md:w-[42%] h-full border-r-2 border-black bg-card p-6 flex flex-col gap-6 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="h-7 w-36 pixel-flat bg-muted/50 animate-pulse" />
          <div className="h-7 w-20 pixel-flat bg-muted/40 animate-pulse" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-6 w-3/4 bg-muted/70 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-muted/40 animate-pulse" />
            <div className="h-5 w-20 bg-muted/40 animate-pulse" />
            <div className="h-5 w-20 bg-muted/40 animate-pulse" />
          </div>
        </div>
        <div className="h-0.5 bg-border" />
        <div className="flex flex-col gap-3 flex-1">
          <div className="h-4 w-full bg-muted/40 animate-pulse" />
          <div className="h-4 w-5/6 bg-muted/40 animate-pulse" />
          <div className="h-4 w-4/5 bg-muted/40 animate-pulse" />
          <div className="h-28 w-full pixel-inset bg-muted/20 animate-pulse mt-4" />
        </div>
      </div>

      {/* Right Code Workspace Skeleton */}
      <div className="w-full md:w-[58%] h-full bg-background flex flex-col overflow-hidden">
        <div className="h-10 border-b-2 border-black bg-muted/60 p-2 flex items-center justify-between">
          <div className="h-6 w-28 pixel-flat bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-6 w-16 pixel-flat bg-muted animate-pulse" />
            <div className="h-6 w-16 pixel-flat bg-primary/40 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-muted/20 animate-pulse rounded"
              style={{ width: `${Math.floor(20 + ((i * 37) % 65))}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
