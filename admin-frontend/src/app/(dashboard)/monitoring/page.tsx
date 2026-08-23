"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock,
  Globe,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldOff,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import {
  getAdminProctorFindingsAction,
  getMonitoringSnapshotAction,
  toggleProctorExemptionAction,
} from "@/actions/telemetry";
import { AgentsTable } from "@/components/monitoring/agents-table";
import { FleetHeader } from "@/components/monitoring/fleet-header";
import { formatDuration } from "@/lib/monitoring";
import type { CompetitorHeartbeat, TelemetryStatus } from "@/types/telemetry";
import type { CompetitorRisk, EnrolledAgent, ProctorOverview } from "@/types/proctor";
import { MONITORING_SECTIONS, type MonitoringSection } from "@/types/monitoring";

type Tab = "TELEMETRY" | "PROCTOR_RISK" | "AGENTS";

const POLL_INTERVAL_MS = 10_000;

/** What the visible tab needs. The fleet header sits above all three of them. */
function sectionsForTab(tab: Tab): MonitoringSection[] {
  switch (tab) {
    case "TELEMETRY":
      return ["overview", "telemetry"];
    case "PROCTOR_RISK":
      return ["overview", "risk"];
    case "AGENTS":
      return ["overview", "agents"];
  }
}

interface EvidenceFinding {
  id: string;
  ruleId: string;
  title: string;
  category: string;
  weight: number;
  evidence: any;
  createdAt: string;
}

export default function OnsiteMonitoringPage() {
  const [activeTab, setActiveTab] = useState<Tab>("TELEMETRY");
  const [overview, setOverview] = useState<ProctorOverview | null>(null);
  const [agents, setAgents] = useState<EnrolledAgent[]>([]);
  const [telemetryList, setTelemetryList] = useState<CompetitorHeartbeat[]>([]);
  const [riskList, setRiskList] = useState<CompetitorRisk[]>([]);
  const [selectedUserRisk, setSelectedUserRisk] = useState<CompetitorRisk | null>(null);
  const [userFindings, setUserFindings] = useState<EvidenceFinding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A Server Action cannot be aborted, so a superseded refresh is discarded on
  // arrival instead: switching tabs, hitting Refresh or unmounting bumps this,
  // and a reply that does not match is dropped rather than overwriting newer
  // rows with older ones.
  const generation = useRef(0);

  const load = useCallback(async (sections: MonitoringSection[]) => {
    const mine = ++generation.current;
    setIsRefreshing(true);
    try {
      const result = await getMonitoringSnapshotAction(sections);
      if (mine !== generation.current) return;

      if (result.unauthenticated) {
        window.location.href = "/login";
        return;
      }
      if (result.error || !result.snapshot) {
        setLoadError(result.error ?? "Monitoring feed unavailable.");
        return;
      }

      const { overview, telemetry, risk, agents, errors } = result.snapshot;
      if (overview) setOverview(overview);
      if (telemetry) setTelemetryList(telemetry);
      if (risk) setRiskList(risk);
      if (agents) setAgents(agents);

      const failed = Object.keys(errors ?? {});
      setLoadError(failed.length > 0 ? `Could not refresh: ${failed.join(", ")}.` : null);
    } finally {
      if (mine === generation.current) setIsRefreshing(false);
    }
  }, []);

  const refreshNow = useCallback(() => {
    void load([...MONITORING_SECTIONS]);
  }, [load]);

  const handleFetchUserFindings = async (user: CompetitorRisk) => {
    setSelectedUserRisk(user);
    setLoadingFindings(true);
    const res = await getAdminProctorFindingsAction(user.userId);
    if (!res.error) {
      setUserFindings(res.findings);
    }
    setLoadingFindings(false);
  };

  const handleToggleExemption = async (userId: string, currentExempt: boolean) => {
    let reason = "";
    if (!currentExempt) {
      const entered = window.prompt(
        "Granting an exemption lets this contestant submit without a reporting agent.\nIt expires in 4 hours. Reason:",
        ""
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();
    }

    const res = await toggleProctorExemptionAction(userId, !currentExempt, reason);
    if (!res.error) {
      refreshNow();
      if (selectedUserRisk?.userId === userId) {
        setSelectedUserRisk((prev) => (prev ? { ...prev, proctorExempt: !currentExempt } : null));
      }
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    // Chained timeouts rather than setInterval: a tick that outran the interval
    // used to have the next one start on top of it, so the console got slower
    // exactly when the API was already struggling.
    const tick = async () => {
      await load(sectionsForTab(activeTab));
      if (stopped || !isAutoRefreshActive) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    const start = async () => {
      // Every section on the way in, so the counts on the tabs nobody is looking
      // at are populated too; the polled ticks above refresh only the visible one.
      await load([...MONITORING_SECTIONS]);
      if (stopped || !isAutoRefreshActive) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void start();

    return () => {
      stopped = true;
      // Bumping the counter here is the point: it invalidates a reply still in
      // flight. The rule guards against reading a stale DOM node on cleanup,
      // which this is not.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      if (timer) clearTimeout(timer);
    };
  }, [activeTab, isAutoRefreshActive, load]);

  const filteredTelemetry = telemetryList.filter((item) => {
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    const matchesQuery =
      searchQuery.trim() === "" ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.team_name && item.team_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.ip_address.includes(searchQuery);
    return matchesStatus && matchesQuery;
  });

  const filteredRisk = riskList.filter((item) => {
    const matchesQuery =
      searchQuery.trim() === "" ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = statusFilter === "ALL" || item.severity === statusFilter;
    return matchesQuery && matchesSeverity;
  });

  const onlineCount = telemetryList.filter((i) => i.status === "ONLINE").length;
  const highRiskCount = riskList.filter((i) => i.severity === "HIGH").length;

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="size-6 text-primary shrink-0" />
            Onsite Proctoring & Risk Control Center
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time monitoring of contestant desktop heartbeats, LLM port probes, and
            non-intrusive risk scoring.
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

      <FleetHeader overview={overview} />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          onClick={() => setActiveTab("PROCTOR_RISK")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTab === "PROCTOR_RISK"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          Risk & Evidence Findings ({highRiskCount} High Risk)
        </button>
        <button
          onClick={() => setActiveTab("TELEMETRY")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTab === "TELEMETRY"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          Live Telemetry Heartbeats ({onlineCount} Online)
        </button>
        <button
          onClick={() => setActiveTab("AGENTS")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            activeTab === "AGENTS"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          Enrolled Agents ({agents.filter((a) => !a.revokedAt).length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contestant by name, username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {(activeTab === "PROCTOR_RISK"
            ? ["ALL", "HIGH", "MEDIUM", "LOW"]
            : ["ALL", "ONLINE", "STALE", "OFFLINE", "GAP"]
          ).map((tab) => (
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

      {/* Table Content */}
      {activeTab === "AGENTS" ? (
        <AgentsTable agents={agents} onChanged={refreshNow} />
      ) : activeTab === "TELEMETRY" ? (
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Contestant</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Dark for</th>
                <th className="px-4 py-3">Machine / IP</th>
                <th className="px-4 py-3">Proctor client</th>
                <th className="px-4 py-3">Signals</th>
                <th className="px-4 py-3">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTelemetry.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No contestant heartbeats match your criteria.
                  </td>
                </tr>
              ) : (
                filteredTelemetry.map((item) => (
                  <tr key={item.user_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/monitoring/${item.user_id}`}
                        className="font-semibold hover:underline"
                      >
                        {item.display_name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        @{item.username}
                        {item.team_name && ` · ${item.team_name}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ModeBadge item={item} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} inGap={item.in_gap} />
                    </td>
                    <td className="px-4 py-3">
                      <DarkForCell item={item} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      <div>{item.ip_address || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">
                      <div>{item.agent_version || "—"}</div>
                      {item.os_info && (
                        <div
                          className="text-[10px] text-muted-foreground/70 truncate max-w-[160px]"
                          title={item.os_info}
                        >
                          {item.os_info}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SignalsCell item={item} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatTimeAgo(item.last_ping_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Risk & Evidence View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Contestant</th>
                  <th className="px-4 py-3 text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRisk.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-8 text-center text-muted-foreground">
                      No contestant risk entries found.
                    </td>
                  </tr>
                ) : (
                  filteredRisk.map((item) => (
                    <tr
                      key={item.userId}
                      onClick={() => handleFetchUserFindings(item)}
                      className={`cursor-pointer hover:bg-muted/40 transition-colors ${
                        selectedUserRisk?.userId === item.userId ? "bg-muted/60" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{item.displayName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          @{item.username} · {item.findingCount} finding(s)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <SeverityBadge severity={item.severity} score={item.score} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Findings Detail Pane */}
          <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
            {selectedUserRisk ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {selectedUserRisk.displayName} (@{selectedUserRisk.username})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Last ping:{" "}
                      {selectedUserRisk.lastPingAt
                        ? formatTimeAgo(selectedUserRisk.lastPingAt)
                        : "Never"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleToggleExemption(
                          selectedUserRisk.userId,
                          selectedUserRisk.proctorExempt
                        )
                      }
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                        selectedUserRisk.proctorExempt
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-warning/10 text-warning border-warning/30"
                      }`}
                    >
                      {selectedUserRisk.proctorExempt ? "Exemption Active" : "Grant Exemption"}
                    </button>

                    <Link
                      href={`/monitoring/${selectedUserRisk.userId}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-muted"
                    >
                      View Full Timeline
                    </Link>
                  </div>
                </div>

                {loadingFindings ? (
                  <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="size-4 animate-spin" /> Loading findings...
                  </div>
                ) : userFindings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No automated evidence findings recorded for this contestant.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userFindings.map((f) => (
                      <div
                        key={f.id}
                        className="p-3.5 rounded-lg border border-border bg-background/50 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{f.title}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            Weight: {f.weight}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Rule ID: {f.ruleId}
                        </p>
                        {f.evidence && (
                          <pre className="mt-2 p-2 rounded bg-black/40 text-[10px] text-foreground font-mono overflow-x-auto">
                            {JSON.stringify(f.evidence, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-xs text-muted-foreground">
                Select a contestant on the left to inspect automated findings and proctor evidence.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status, inGap }: { status: TelemetryStatus; inGap?: boolean }) {
  if (inGap) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
        <WifiOff className="size-3" /> BLACKOUT
      </span>
    );
  }
  switch (status) {
    case "ONLINE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
          <Wifi className="size-3" /> ONLINE
        </span>
      );
    case "STALE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
          <Clock className="size-3" /> STALE
        </span>
      );
    case "OFFLINE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          <WifiOff className="size-3" /> OFFLINE
        </span>
      );
    default:
      return null;
  }
}

function SeverityBadge({
  severity,
  score,
}: {
  severity: "HIGH" | "MEDIUM" | "LOW";
  score: number;
}) {
  const styles = {
    HIGH: "bg-destructive/15 border-destructive/30 text-destructive",
    MEDIUM: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    LOW: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${styles[severity]}`}
    >
      {severity} ({score})
    </span>
  );
}

function ModeBadge({ item }: { item: CompetitorHeartbeat }) {
  if (item.proctor_exempt) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
        <ShieldOff className="size-3" /> EXEMPT
      </span>
    );
  }
  if (item.client_type === "WEB") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
        <Globe className="size-3" /> BROWSER
      </span>
    );
  }
  return <span className="text-[10px] text-muted-foreground">AGENT ONLY</span>;
}

function DarkForCell({ item }: { item: CompetitorHeartbeat }) {
  if (!item.enrolled) {
    return <span className="text-[10px] text-warning">never enrolled</span>;
  }
  if (item.status === "ONLINE") {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <div className="text-[11px]">
      <span className={item.in_gap ? "font-semibold text-destructive" : "text-warning"}>
        {formatDuration(item.offline_seconds)}
      </span>
      <div className="text-[10px] text-muted-foreground">
        {item.stopped_reason
          ? "stopped deliberately"
          : item.in_gap
            ? "blackout, no clean stop"
            : "no reports"}
      </div>
    </div>
  );
}

function SignalsCell({ item }: { item: CompetitorHeartbeat }) {
  const flags: string[] = [];
  if (item.internet_reachable) flags.push("internet reachable");
  if (item.process_matches.length > 0) flags.push(item.process_matches.join(", "));

  if (flags.length === 0) {
    return <span className="text-[10px] text-muted-foreground">clean</span>;
  }

  return <span className="text-[11px] text-destructive">{flags.join(" · ")}</span>;
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
