"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
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
import Link from "next/link";
import {
  getAdminTelemetryAction,
  getAdminProctorRiskAction,
  getAdminProctorFindingsAction,
  getAdminProctorOverviewAction,
  getAdminAgentsAction,
  toggleProctorExemptionAction,
} from "@/actions/telemetry";
import { AgentsTable } from "@/components/monitoring/agents-table";
import { FleetHeader } from "@/components/monitoring/fleet-header";
import { formatDuration } from "@/lib/monitoring";
import type { CompetitorHeartbeat, TelemetryClientType, TelemetryStatus } from "@/types/telemetry";
import type { EnrolledAgent, ProctorOverview } from "@/types/proctor";

interface CompetitorRisk {
  userId: string;
  username: string;
  displayName: string;
  proctorExempt: boolean;
  score: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  findingCount: number;
  lastPingAt: string | null;
  allowWebWithAgent?: boolean;
  allowWebOnly?: boolean;
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
  const [activeTab, setActiveTab] = useState<"TELEMETRY" | "PROCTOR_RISK" | "AGENTS">("TELEMETRY");
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
  const [isPending, startTransition] = useTransition();

  const fetchData = () => {
    startTransition(async () => {
      const [telRes, riskRes, overviewRes, agentsRes] = await Promise.all([
        getAdminTelemetryAction(),
        getAdminProctorRiskAction(),
        getAdminProctorOverviewAction(),
        getAdminAgentsAction(),
      ]);
      if (!telRes.error) {
        setTelemetryList(telRes.telemetry);
      }
      if (!riskRes.error) {
        setRiskList(riskRes.risk);
      }
      if (overviewRes.overview) {
        setOverview(overviewRes.overview);
      }
      if (!agentsRes.error) {
        setAgents(agentsRes.agents);
      }
    });
  };

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
      // An exemption switches proctoring off for one person, so it has to say why
      // and it lapses on its own. The API rejects a blank reason.
      const entered = window.prompt(
        "Granting an exemption lets this contestant submit without a reporting agent.\nIt expires in 4 hours. Reason:",
        ""
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();
    }

    const res = await toggleProctorExemptionAction(userId, !currentExempt, reason);
    if (!res.error) {
      fetchData();
      if (selectedUserRisk?.userId === userId) {
        setSelectedUserRisk((prev) => (prev ? { ...prev, proctorExempt: !currentExempt } : null));
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!isAutoRefreshActive) return;
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [isAutoRefreshActive]);

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
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="size-6 text-primary" />
            Onsite Proctoring & Risk Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
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
            {isAutoRefreshActive ? "Auto-refreshing (10s)" : "Auto-refresh paused"}
          </button>

          <button
            onClick={fetchData}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <FleetHeader overview={overview} />

      {/* Tabs */}
      <div className="flex items-center gap-3">
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
      <div className="flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-2">
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

      {/* PROCTOR RISK TAB CONTENT */}
      {activeTab === "PROCTOR_RISK" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div
            className={`${selectedUserRisk ? "lg:col-span-2" : "lg:col-span-3"} rounded-lg border bg-card overflow-hidden shadow-sm`}
          >
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground font-medium">
                  <th className="px-4 py-3">Contestant</th>
                  <th className="px-4 py-3">Risk Score</th>
                  <th className="px-4 py-3">Findings</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRisk.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No contestant risk entries found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRisk.map((item) => (
                    <tr
                      key={item.userId}
                      onClick={() => handleFetchUserFindings(item)}
                      className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                        selectedUserRisk?.userId === item.userId ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{item.displayName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          @{item.username}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.severity === "HIGH"
                              ? "bg-destructive/10 text-destructive border border-destructive/30"
                              : item.severity === "MEDIUM"
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                          }`}
                        >
                          {item.score} pts ({item.severity})
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{item.findingCount} evidence rules</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {item.proctorExempt ? (
                            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                              <UserCheck className="size-3" /> EXEMPT
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              ENFORCED
                            </span>
                          )}
                          {/* Only shown when granted. A browser path is context a reviewer
                              needs while reading this row's findings — the same submission
                              means something different under it. */}
                          {item.allowWebWithAgent && (
                            <span className="text-[10px] font-semibold text-amber-400">
                              BROWSER +AGENT
                            </span>
                          )}
                          {item.allowWebOnly && (
                            <span className="text-[10px] font-semibold text-rose-400">
                              BROWSER ONLY
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleExemption(item.userId, item.proctorExempt);
                          }}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {item.proctorExempt ? "Enforce" : "Exempt"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Evidence Details Drawer */}
          {selectedUserRisk && (
            <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-start border-b pb-2">
                <div>
                  <h3 className="font-bold text-foreground text-sm">
                    {selectedUserRisk.displayName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    @{selectedUserRisk.username}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedUserRisk(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              {loadingFindings ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Loading evidence trail...
                </div>
              ) : userFindings.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                  <ShieldCheck className="size-6 text-emerald-500" />
                  No evidence findings recorded.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {userFindings.map((f) => (
                    <div key={f.id} className="p-3 bg-muted/40 border rounded-md text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-amber-500 flex items-center gap-1">
                          <AlertTriangle className="size-3.5" />
                          {f.title}
                        </span>
                        <span className="text-destructive font-mono">+{f.weight} pts</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{f.category}</p>
                      {f.evidence && (
                        <pre className="text-[10px] font-mono bg-background p-2 rounded text-foreground overflow-x-auto">
                          {JSON.stringify(f.evidence, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TELEMETRY TAB CONTENT */}
      {activeTab === "AGENTS" && <AgentsTable agents={agents} onChanged={fetchData} />}

      {activeTab === "TELEMETRY" && (
        <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground font-medium">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Competitor</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Portal Type</th>
                  <th className="px-4 py-3">Dark for</th>
                  <th className="px-4 py-3">Active Window</th>
                  <th className="px-4 py-3">Signals</th>
                  <th className="px-4 py-3">IP &amp; OS</th>
                  <th className="px-4 py-3">Last Ping</th>
                  <th className="px-4 py-3 text-right">Exemption</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTelemetry.map((item) => (
                  <tr key={item.user_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/monitoring/${item.user_id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {item.display_name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        @{item.username}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.team_name ? (
                        item.team_name
                      ) : (
                        <span className="text-muted-foreground italic">No Team</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ClientTypeBadge clientType={item.client_type} />
                    </td>
                    <td className="px-4 py-3">
                      <DarkForCell item={item} />
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate font-mono text-[11px]">
                      {item.active_window || "Unknown Window"}
                    </td>
                    <td className="px-4 py-3">
                      <SignalsCell item={item} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[11px]">{item.ip_address || "N/A"}</div>
                      <div className="text-[10px] text-muted-foreground">{item.os_info}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(item.last_ping_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          handleToggleExemption(item.user_id, Boolean(item.proctor_exempt))
                        }
                        className={`text-[11px] font-semibold ${
                          item.proctor_exempt
                            ? "text-emerald-400 hover:underline"
                            : "text-primary hover:underline"
                        }`}
                      >
                        {item.proctor_exempt ? "Exempt (Revoke)" : "Grant Exempt"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TelemetryStatus }) {
  if (status === "ONLINE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">
        <span className="size-1.5 rounded-full bg-success animate-pulse" />
        ONLINE
      </span>
    );
  }
  if (status === "STALE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20">
        <span className="size-1.5 rounded-full bg-warning" />
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

// Which client someone uses is a fact, not a severity. Agent liveness owns colour
// in this table, so this badge stays neutral.
function ClientTypeBadge({ clientType }: { clientType?: TelemetryClientType }) {
  if (clientType === "WEB") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border text-muted-foreground">
        <Globe className="size-3" />
        BROWSER
      </span>
    );
  }
  if (clientType === "DESKTOP") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border text-muted-foreground">
        <Laptop className="size-3" />
        DESKTOP SHELL
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
