export default function DocsLoading() {
  return (
    <div className="h-full w-full flex flex-col md:flex-row font-mono overflow-hidden">
      {/* Sidebar Skeleton */}
      <div className="w-full md:w-64 h-full border-r-2 border-black bg-card p-4 flex flex-col gap-4">
        <div className="h-8 w-full pixel-inset bg-muted/40 animate-pulse" />
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-7 w-full pixel-flat bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
      {/* Content Skeleton */}
      <div className="flex-1 h-full p-6 flex flex-col gap-4 overflow-hidden">
        <div className="h-7 w-48 bg-muted/70 animate-pulse" />
        <div className="h-4 w-full bg-muted/30 animate-pulse" />
        <div className="h-4 w-5/6 bg-muted/30 animate-pulse" />
        <div className="h-36 w-full pixel-inset bg-muted/20 animate-pulse mt-4" />
      </div>
    </div>
  );
}
