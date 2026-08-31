"use client";

import { useState } from "react";
import Link from "next/link";

import { getAdminProctorFindingsAction, toggleProctorExemptionAction } from "@/lib/actions/monitoring";
import { SeverityBadge, formatTimeAgo } from "@/components/monitoring/badges";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { MonitoringFilters } from "@/components/monitoring/monitoring-filters";
import { EvidenceCard } from "@/components/monitoring/evidence-card";
import { FindingsSkeleton, RiskPanelSkeleton } from "@/components/monitoring/skeletons";
import type { CompetitorRisk, EvidenceFinding } from "@/types/proctor";

const SEVERITY_OPTIONS = ["ALL", "HIGH", "MEDIUM", "LOW"];

export default function RiskPage() {
  const { risk, loaded, searchQuery, statusFilter, refreshNow } = useMonitoring();

  const [selected, setSelected] = useState<CompetitorRisk | null>(null);
  const [findings, setFindings] = useState<EvidenceFinding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);

  const filtered = risk.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query === "" ||
      item.username.toLowerCase().includes(query) ||
      item.displayName.toLowerCase().includes(query);
    const matchesSeverity = statusFilter === "ALL" || item.severity === statusFilter;
    return matchesQuery && matchesSeverity;
  });

  const openFindings = async (user: CompetitorRisk) => {
    setSelected(user);
    setFindings([]);
    setLoadingFindings(true);
    const res = await getAdminProctorFindingsAction(user.userId);
    if (!res.error) setFindings(res.findings);
    setLoadingFindings(false);
  };

  const toggleExemption = async (userId: string, currentExempt: boolean) => {
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
      if (selected?.userId === userId) {
        setSelected((prev) => (prev ? { ...prev, proctorExempt: !currentExempt } : null));
      }
    }
  };

  return (
    <div className="space-y-6">
      <MonitoringFilters options={SEVERITY_OPTIONS} />

      {!loaded.risk ? (
        <RiskPanelSkeleton />
      ) : (
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
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-8 text-center text-muted-foreground">
                      No contestant risk entries found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={item.userId}
                      onClick={() => openFindings(item)}
                      className={`cursor-pointer hover:bg-muted/40 transition-colors ${
                        selected?.userId === item.userId ? "bg-muted/60" : ""
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

          <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
            {selected ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {selected.displayName} (@{selected.username})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Last ping:{" "}
                      {selected.lastPingAt ? formatTimeAgo(selected.lastPingAt) : "Never"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExemption(selected.userId, selected.proctorExempt)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                        selected.proctorExempt
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-warning/10 text-warning border-warning/30"
                      }`}
                    >
                      {selected.proctorExempt ? "Exemption Active" : "Grant Exemption"}
                    </button>

                    <Link
                      href={`/monitoring/${selected.userId}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-muted"
                    >
                      View Full Timeline
                    </Link>
                  </div>
                </div>

                {loadingFindings ? (
                  <FindingsSkeleton />
                ) : findings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                    No automated evidence findings recorded for this contestant.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {findings.map((f) => (
                      <EvidenceCard key={f.id} finding={f} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-16 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg space-y-2">
                <p className="font-semibold text-foreground text-sm">No Contestant Selected</p>
                <p>Select a contestant from the risk table on the left to inspect automated findings and telemetry evidence.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
