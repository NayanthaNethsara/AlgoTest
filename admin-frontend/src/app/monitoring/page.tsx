"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Globe,
  Laptop,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { getAdminTelemetryAction } from "@/actions/telemetry";
import type { CompetitorHeartbeat, TelemetryClientType, TelemetryStatus } from "@/types/telemetry";

export default function OnsiteMonitoringPage() {
  const [telemetryList, setTelemetryList] = useState<CompetitorHeartbeat[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isPending, startTransition] = useTransition();

  const fetchTelemetryData = () => {
    startTransition(async () => {
      const res = await getAdminTelemetryAction();
      if (!res.error) {
        setTelemetryList(res.telemetry);
        setLastRefreshedAt(new Date());
      }
    });
  };

  useEffect(() => {
    fetchTelemetryData();
  }, []);

  useEffect(() => {
    if (!isAutoRefreshActive) return;
    const interval = setInterval(() => {
      fetchTelemetryData();
    }, 10_000);
    return () => clearInterval(interval);
  }, [isAutoRefreshActive]);

  const filteredList = telemetryList.filter((item) => {
    const matchesStatus =
      statusFilter === "ALL" || item.status === statusFilter;
    const matchesQuery =
      searchQuery.trim() === "" ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.team_name && item.team_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.ip_address.includes(searchQuery);
    return matchesStatus && matchesQuery;
  });

  const onlineCount = telemetryList.filter((i) => i.status === "ONLINE").length;
  const staleCount = telemetryList.filter((i) => i.status === "STALE").length;
  const offlineCount = telemetryList.filter((i) => i.status === "OFFLINE").length;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="size-6 text-primary" />
            Onsite Competitor Telemetry Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time status monitoring for competitor desktop app background heartbeats.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAutoRefreshActive(!isAutoRefreshActive)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              isAutoRefreshActive
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-muted/50 text-muted-foreground border-border"
            }`}
          >
            <Clock className="size-3.5" />
            {isAutoRefreshActive ? "Auto-refreshing (10s)" : "Auto-refresh paused"}
          </button>

          <button
            onClick={fetchTelemetryData}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Competitors</p>
            <p className="text-2xl font-bold text-foreground mt-1">{telemetryList.length}</p>
          </div>
          <div className="p-2.5 rounded-full bg-secondary text-secondary-foreground">
            <UserCheck className="size-5" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-emerald-500">Active Online</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{onlineCount}</p>
          </div>
          <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-400">
            <Wifi className="size-5" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-amber-500">Stale Ping (&gt;45s)</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{staleCount}</p>
          </div>
          <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-400">
            <ShieldAlert className="size-5" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-medium text-destructive">Offline (&gt;2m)</p>
            <p className="text-2xl font-bold text-destructive mt-1">{offlineCount}</p>
          </div>
          <div className="p-2.5 rounded-full bg-destructive/10 text-destructive">
            <WifiOff className="size-5" />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search competitor name, team, or IP address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          {["ALL", "ONLINE", "STALE", "OFFLINE"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === tab
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground font-medium">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Competitor</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Portal Type</th>
                <th className="px-4 py-3">Active Window</th>
                <th className="px-4 py-3">IP &amp; OS</th>
                <th className="px-4 py-3">Processes Overview</th>
                <th className="px-4 py-3">Last Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No competitor telemetry heartbeats found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => (
                  <tr key={item.user_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{item.display_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">@{item.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      {item.team_name ? (
                        <span className="font-medium text-foreground">{item.team_name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">No Team</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ClientTypeBadge clientType={item.client_type} />
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      <span className="font-mono text-[11px] text-foreground">
                        {item.active_window || "Unknown Window"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[11px] text-foreground">{item.ip_address || "N/A"}</div>
                      <div className="text-[10px] text-muted-foreground">{item.os_info || "Desktop App"}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <ProcessSummary processes={item.running_processes} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(item.last_ping_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TelemetryStatus }) {
  if (status === "ONLINE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        ONLINE
      </span>
    );
  }
  if (status === "STALE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="size-1.5 rounded-full bg-amber-400" />
        STALE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
      <span className="size-1.5 rounded-full bg-destructive" />
      OFFLINE
    </span>
  );
}

function ProcessSummary({ processes }: { processes: string[] }) {
  if (!processes || processes.length === 0) {
    return <span className="text-muted-foreground italic">No processes</span>;
  }

  const primaryProcesses = processes.slice(0, 4);
  const remainingCount = processes.length - primaryProcesses.length;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {primaryProcesses.map((proc, idx) => (
        <span
          key={idx}
          className="px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono text-[10px]"
        >
          {proc}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">
          +{remainingCount} more
        </span>
      )}
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Never";

  const diffSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (diffSeconds < 10) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  return `${Math.floor(diffSeconds / 3600)}h ago`;
}

function ClientTypeBadge({ clientType }: { clientType?: TelemetryClientType }) {
  if (clientType === "WEB") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Globe className="size-3" />
        WEB PORTAL
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
      <Laptop className="size-3" />
      DESKTOP APP
    </span>
  );
}
