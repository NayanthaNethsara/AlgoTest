"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon, SearchXIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";

import {
  getAdminProctorFindingsAction,
  toggleProctorExemptionAction,
} from "@/lib/actions/monitoring";
import { getErrorMessage } from "@/lib/errors";
import { SeverityBadge, formatTimeAgo } from "@/components/monitoring/badges";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { MonitoringFilters } from "@/components/monitoring/monitoring-filters";
import { EvidenceCard } from "@/components/monitoring/evidence-card";
import { FindingsSkeleton, RiskPanelSkeleton } from "@/components/monitoring/skeletons";
import {
  AccessReasonDialog,
  type AccessReasonRequest,
} from "@/components/proctoring/access-reason-dialog";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState } from "@/components/shell/data-states";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import type { CompetitorRisk, EvidenceFinding } from "@/types/proctor";

const SEVERITY_OPTIONS = ["ALL", "HIGH", "MEDIUM", "LOW"];

export default function RiskPage() {
  const { risk, loaded, searchQuery, statusFilter, refreshNow } = useMonitoring();

  const [selected, setSelected] = useState<CompetitorRisk | null>(null);
  const [findings, setFindings] = useState<EvidenceFinding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [exemptionTarget, setExemptionTarget] = useState<CompetitorRisk | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return risk.filter((item) => {
      const matchesQuery =
        query === "" ||
        item.username.toLowerCase().includes(query) ||
        item.displayName.toLowerCase().includes(query);
      const matchesSeverity = statusFilter === "ALL" || item.severity === statusFilter;
      return matchesQuery && matchesSeverity;
    });
  }, [risk, searchQuery, statusFilter]);

  const pagination = usePagination(filtered, 10);

  async function openFindings(user: CompetitorRisk) {
    setSelected(user);
    setFindings([]);
    setLoadingFindings(true);
    try {
      const res = await getAdminProctorFindingsAction(user.userId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setFindings(res.findings);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load the evidence findings."));
    } finally {
      setLoadingFindings(false);
    }
  }

  async function applyExemption(user: CompetitorRisk, enabled: boolean, reason: string) {
    setPending(true);
    try {
      const res = await toggleProctorExemptionAction(user.userId, enabled, reason);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setExemptionTarget(null);
      setSelected((prev) =>
        prev?.userId === user.userId ? { ...prev, proctorExempt: enabled } : prev
      );
      toast.success(enabled ? "Exemption granted" : "Exemption revoked", {
        description: user.displayName,
      });
      refreshNow();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the exemption."));
    } finally {
      setPending(false);
    }
  }

  function requestExemptionToggle(user: CompetitorRisk) {
    if (user.proctorExempt) {
      void applyExemption(user, false, "");
      return;
    }
    setExemptionTarget(user);
  }

  const exemptionRequest: AccessReasonRequest | null = exemptionTarget && {
    title: "Grant proctoring exemption",
    consequence: `${exemptionTarget.displayName} will be able to submit without a reporting proctor agent. The exemption expires in 4 hours.`,
    subject: `${exemptionTarget.displayName} (@${exemptionTarget.username})`,
    defaultReason: "",
    confirmLabel: "Grant exemption",
  };

  return (
    <div className="flex flex-col gap-5">
      <MonitoringFilters options={SEVERITY_OPTIONS} />

      {!loaded.risk ? (
        <RiskPanelSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border bg-card lg:col-span-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Contestant</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={2}
                      className="p-8 text-center text-xs text-muted-foreground"
                    >
                      No contestant matches these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.items.map((item) => {
                    const active = selected?.userId === item.userId;
                    return (
                      <TableRow
                        key={item.userId}
                        onClick={() => openFindings(item)}
                        aria-selected={active}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openFindings(item);
                          }
                        }}
                        className={cn(
                          "cursor-pointer outline-none focus-visible:bg-muted/60",
                          active && "bg-muted/60"
                        )}
                      >
                        <TableCell>
                          <div className="text-xs font-semibold">{item.displayName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            @{item.username} · {item.findingCount} finding(s)
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <SeverityBadge severity={item.severity} score={item.score} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <DataPagination state={pagination} itemLabel="contestant" compact />
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:col-span-2">
            {selected ? (
              <>
                <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold">
                      {selected.displayName}{" "}
                      <span className="font-normal text-muted-foreground">
                        @{selected.username}
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Last ping:{" "}
                      {selected.lastPingAt ? formatTimeAgo(selected.lastPingAt) : "never"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestExemptionToggle(selected)}
                      disabled={pending}
                      aria-pressed={selected.proctorExempt}
                      className={cn(
                        "gap-1.5",
                        selected.proctorExempt
                          ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                          : "border-warning/30 text-warning hover:bg-warning/10 hover:text-warning"
                      )}
                    >
                      {selected.proctorExempt ? <ShieldOffIcon /> : <ShieldCheckIcon />}
                      {selected.proctorExempt ? "Exemption active" : "Grant exemption"}
                    </Button>

                    <Link
                      href={`/monitoring/${selected.userId}`}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                        className: "gap-1.5",
                      })}
                    >
                      <ExternalLinkIcon /> Timeline
                    </Link>
                  </div>
                </div>

                {loadingFindings ? (
                  <FindingsSkeleton />
                ) : findings.length === 0 ? (
                  <EmptyState
                    icon={<ShieldCheckIcon />}
                    title="No evidence findings"
                    description="Nothing automated has been recorded against this contestant."
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {findings.map((f) => (
                      <EvidenceCard key={f.id} finding={f} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<SearchXIcon />}
                title="No contestant selected"
                description="Pick a contestant from the risk list to inspect their automated findings and telemetry evidence."
                className="min-h-64"
              />
            )}
          </div>
        </div>
      )}

      <AccessReasonDialog
        request={exemptionRequest}
        pending={pending}
        onConfirm={(reason) => exemptionTarget && applyExemption(exemptionTarget, true, reason)}
        onCancel={() => setExemptionTarget(null)}
      />
    </div>
  );
}
