import type { ReactNode } from "react";

import { MonitoringChrome } from "@/components/monitoring/monitoring-chrome";
import { MonitoringProvider } from "@/components/monitoring/monitoring-context";

/**
 * Wraps only the console sections, not `/monitoring/[userId]` -- the per-contestant
 * timeline is a detail view and should not inherit the fleet header and section
 * nav. The route group keeps it out without adding a path segment.
 *
 * Because the provider is mounted here rather than in each page, moving between
 * sections keeps the polled snapshot: no refetch, no flash of skeletons.
 */
export default function MonitoringConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <MonitoringProvider>
      <MonitoringChrome>{children}</MonitoringChrome>
    </MonitoringProvider>
  );
}
