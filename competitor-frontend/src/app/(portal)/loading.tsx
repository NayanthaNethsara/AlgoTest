export default function PortalLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8 font-mono">
      <div className="flex flex-col items-center gap-3 pixel-raised bg-card p-6">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          Loading view…
        </span>
      </div>
    </div>
  );
}
