/**
 * Skeletons for the monitoring console.
 *
 * These stand in for the *first* load only. Once a section has arrived the poll
 * updates it in place: swapping a populated table back to skeletons every ten
 * seconds would make a console somebody is invigilating from flicker, so
 * `MonitoringProvider` tracks a per-section "loaded" flag rather than a single
 * global one.
 *
 * Every skeleton mirrors the real element's column count and row height, so the
 * layout does not jump when the data lands.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/60 ${className}`} />;
}

/** Column widths are varied so a loading table reads as rows of data, not a grid. */
const CELL_WIDTHS = ["w-32", "w-16", "w-20", "w-14", "w-24", "w-20", "w-24", "w-16"];

export function TableSkeleton({
  rows = 8,
  headers,
  /** Column carrying a name over a secondary line; -1 for none. */
  subLineIndex = 0,
}: {
  rows?: number;
  headers: string[];
  subLineIndex?: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
          <tr>
            {headers.map((h, c) => (
              <th key={h || `col-${c}`} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {headers.map((h, c) => (
                <td key={h || `col-${c}`} className="px-4 py-3">
                  <Shimmer className={`h-3.5 ${CELL_WIDTHS[c % CELL_WIDTHS.length]}`} />
                  {c === subLineIndex && <Shimmer className="mt-1.5 h-2.5 w-20" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The fleet header's stat cards, which sit above every monitoring page. */
export function FleetHeaderSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
          <Shimmer className="h-2.5 w-24" />
          <Shimmer className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Left-hand risk list plus the findings detail pane. */
export function RiskPanelSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <TableSkeleton rows={6} headers={["Contestant", "Risk Score"]} />
      </div>
      <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-2">
            <Shimmer className="h-4 w-48" />
            <Shimmer className="h-2.5 w-28" />
          </div>
          <Shimmer className="h-7 w-32" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3.5 rounded-lg border border-border bg-background/50 space-y-2">
            <div className="flex items-center justify-between">
              <Shimmer className="h-3 w-40" />
              <Shimmer className="h-3 w-16" />
            </div>
            <Shimmer className="h-2.5 w-32" />
            <Shimmer className="h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Findings load on click, independently of the polled snapshot. */
export function FindingsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3.5 rounded-lg border border-border bg-background/50 space-y-2">
          <div className="flex items-center justify-between">
            <Shimmer className="h-3 w-40" />
            <Shimmer className="h-3 w-16" />
          </div>
          <Shimmer className="h-2.5 w-32" />
          <Shimmer className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}
