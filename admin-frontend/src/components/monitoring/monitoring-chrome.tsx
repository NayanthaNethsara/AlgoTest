"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, RefreshCw, ShieldAlert } from "lucide-react";

import { FleetHeader } from "@/components/monitoring/fleet-header";
import { FleetHeaderSkeleton } from "@/components/monitoring/skeletons";
import { POLL_INTERVAL_MS, useMonitoring } from "@/components/monitoring/monitoring-context";

/**
 * Everything the three monitoring pages share: title, refresh controls, the
 * fleet header and the section nav. It lives in the layout, so moving between
 * sections swaps only the table underneath -- the provider stays mounted and
 * the polled data survives the navigation.
 */
export function MonitoringChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    overview,
    telemetry,
    risk,
    agents,
    loaded,
    isRefreshing,
    loadError,
    isAutoRefreshActive,
    setAutoRefreshActive,
    refreshNow,
  } = useMonitoring();

  const onlineCount = telemetry.filter((i) => i.status === "ONLINE").length;
  const highRiskCount = risk.filter((i) => i.severity === "HIGH").length;
  const liveAgentCount = agents.filter((a) => !a.revokedAt).length;

  const links = [
    {
      href: "/monitoring/risk",
      label: "Risk & Evidence Findings",
      count: loaded.risk ? `${highRiskCount} High Risk` : null,
    },
    {
      href: "/monitoring/telemetry",
      label: "Live Telemetry Heartbeats",
      count: loaded.telemetry ? `${onlineCount} Online` : null,
    },
    {
      href: "/monitoring/agents",
      label: "Enrolled Agents",
      count: loaded.agents ? `${liveAgentCount}` : null,
    },
  ];

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="size-6 text-primary shrink-0" />
            Onsite Proctoring &amp; Risk Control Center
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time monitoring of contestant desktop heartbeats, LLM port probes, and
            non-intrusive risk scoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefreshActive(!isAutoRefreshActive)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              isAutoRefreshActive
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-muted/50 text-muted-foreground border-border"
            }`}
          >
            <Clock className="size-3.5" />
            {isAutoRefreshActive
              ? `Auto-refreshing (${POLL_INTERVAL_MS / 1000}s)`
              : "Auto-refresh paused"}
          </button>

          <button
            onClick={refreshNow}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {loadError}
        </div>
      )}

      {loaded.overview ? <FleetHeader overview={overview} /> : <FleetHeaderSkeleton />}

      <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {link.label}
              {link.count !== null && ` (${link.count})`}
            </Link>
          );
        })}
      </nav>

      {children}
    </main>
  );
}
