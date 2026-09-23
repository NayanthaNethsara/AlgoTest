"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangleIcon, ClockIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";

import { FleetHeader } from "@/components/monitoring/fleet-header";
import { FleetHeaderSkeleton } from "@/components/monitoring/skeletons";
import { POLL_INTERVAL_MS, useMonitoring } from "@/components/monitoring/monitoring-context";
import { PageHeader } from "@/components/shell/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
      label: "Risk & evidence",
      count: loaded.risk ? `${highRiskCount} high` : null,
      alarming: highRiskCount > 0,
    },
    {
      href: "/monitoring/telemetry",
      label: "Live telemetry",
      count: loaded.telemetry ? `${onlineCount} online` : null,
      alarming: false,
    },
    {
      href: "/monitoring/agents",
      label: "Enrolled agents",
      count: loaded.agents ? `${liveAgentCount}` : null,
      alarming: false,
    },
  ];

  const refreshSeconds = POLL_INTERVAL_MS / 1000;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
      <PageHeader
        className="border-b pb-4"
        title={
          <span className="flex items-center gap-2">
            <ShieldAlertIcon className="size-5 shrink-0 text-primary" />
            Onsite proctoring &amp; risk control
          </span>
        }
        description="Real-time contestant desktop heartbeats, LLM port probes, and non-intrusive risk scoring."
        actions={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutoRefreshActive(!isAutoRefreshActive)}
                    aria-pressed={isAutoRefreshActive}
                    className={cn(
                      "gap-1.5",
                      isAutoRefreshActive &&
                        "border-success/30 bg-success/10 text-success hover:bg-success/20 hover:text-success"
                    )}
                  />
                }
              >
                <ClockIcon />
                <span className="hidden sm:inline">
                  {isAutoRefreshActive ? `Auto ${refreshSeconds}s` : "Auto paused"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isAutoRefreshActive
                  ? `Polling every ${refreshSeconds} seconds — click to pause`
                  : "Auto-refresh paused — click to resume"}
              </TooltipContent>
            </Tooltip>

            <Button size="sm" onClick={refreshNow} disabled={isRefreshing} className="gap-1.5">
              {isRefreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
            </Button>
          </>
        }
      />

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Monitoring data may be stale</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {loaded.overview ? <FleetHeader overview={overview} /> : <FleetHeaderSkeleton />}

      <nav aria-label="Monitoring sections" className="flex flex-wrap items-center gap-2">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {link.label}
              {link.count !== null && (
                <Badge
                  variant={link.alarming && !active ? "destructive" : "secondary"}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {link.count}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
