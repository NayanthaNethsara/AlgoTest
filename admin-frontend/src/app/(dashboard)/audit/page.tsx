"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getAuditLogsAction } from "@/lib/actions/audit";
import type { AuditLogEntry } from "@/types/audit";
import { useAsyncData } from "@/hooks/use-async-data";
import { usePagination } from "@/hooks/use-pagination";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shell/data-states";
import { PageHeader, PageShell } from "@/components/shell/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/search-input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "locked", label: "Locked" },
  { value: "blocked", label: "Blocked" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "all", label: "All targets" },
  { value: "auth", label: "Authentication" },
  { value: "user", label: "User" },
  { value: "contest", label: "Contest" },
  { value: "problem", label: "Problem" },
  { value: "submission", label: "Submission" },
  { value: "proctor", label: "Proctor" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "auth.login.success", label: "auth.login.success" },
  { value: "auth.login.failure", label: "auth.login.failure" },
  { value: "auth.login.locked", label: "auth.login.locked" },
  { value: "auth.logout", label: "auth.logout" },
  { value: "auth.password_change", label: "auth.password_change" },
  { value: "user.create", label: "user.create" },
  { value: "user.bulk_create", label: "user.bulk_create" },
  { value: "user.delete", label: "user.delete" },
  { value: "user.suspend", label: "user.suspend" },
  { value: "user.restore", label: "user.restore" },
  { value: "user.role_update", label: "user.role_update" },
  { value: "user.reset_password", label: "user.reset_password" },
  { value: "contest.start", label: "contest.start" },
  { value: "contest.pause", label: "contest.pause" },
  { value: "contest.resume", label: "contest.resume" },
  { value: "contest.extend", label: "contest.extend" },
  { value: "contest.freeze", label: "contest.freeze" },
  { value: "contest.unfreeze", label: "contest.unfreeze" },
  { value: "contest.reset", label: "contest.reset" },
  { value: "contest.end", label: "contest.end" },
  { value: "contest.settings_update", label: "contest.settings_update" },
  { value: "problem.create", label: "problem.create" },
  { value: "problem.update", label: "problem.update" },
  { value: "problem.delete", label: "problem.delete" },
  { value: "problem.publish", label: "problem.publish" },
  { value: "problem.rejudge", label: "problem.rejudge" },
  { value: "submission.rejudge", label: "submission.rejudge" },
  { value: "submission.cancel", label: "submission.cancel" },
  { value: "submission.review", label: "submission.review" },
  { value: "proctor.revoke", label: "proctor.revoke" },
  { value: "proctor.readmit", label: "proctor.readmit" },
];

const NO_LOGS: AuditLogEntry[] = [];

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [actorSearch, setActorSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const loader = useCallback(async () => {
    const res = await getAuditLogsAction({
      limit: 200,
      offset: 0,
      action: actionFilter === "all" ? undefined : actionFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      targetType: targetTypeFilter === "all" ? undefined : targetTypeFilter,
      actorUsername: actorSearch.trim() || undefined,
    });
    return res.logs || NO_LOGS;
  }, [actionFilter, statusFilter, targetTypeFilter, actorSearch]);

  const {
    data: logs,
    error,
    loading,
    refreshing,
    refresh,
  } = useAsyncData(loader, NO_LOGS, "Failed to load audit logs.");

  const counts = useMemo(
    () => ({
      total: logs.length,
      failures: logs.filter(
        (l) => l.status === "failure" || l.status === "locked" || l.status === "blocked"
      ).length,
      authEvents: logs.filter((l) => l.action.startsWith("auth.")).length,
      adminChanges: logs.filter((l) => !l.action.startsWith("auth.")).length,
    }),
    [logs]
  );

  const pagination = usePagination(logs);

  function copyDetails(entry: AuditLogEntry) {
    const payload = JSON.stringify(entry.details, null, 2);
    navigator.clipboard.writeText(payload);
    setCopied(true);
    toast.success("Details JSON copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="Audit Logs"
        description="Immutable record of administrative actions, authentication attempts, and operational state transitions."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            {refreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Total Logged Events"
          value={counts.total}
          icon={<FileTextIcon className="size-4 text-primary" />}
          loading={loading}
        />
        <MetricCard
          label="Security & Auth Failures"
          value={counts.failures}
          icon={<ShieldAlertIcon className="size-4 text-destructive" />}
          valueClassName={counts.failures > 0 ? "text-destructive" : undefined}
          hint={
            counts.failures > 0
              ? "Inspect failed attempts or lockouts"
              : "No active lockout or attack"
          }
          loading={loading}
        />
        <MetricCard
          label="Authentication Events"
          value={counts.authEvents}
          icon={<ShieldCheckIcon className="size-4 text-muted-foreground" />}
          loading={loading}
        />
        <MetricCard
          label="Operational Modifications"
          value={counts.adminChanges}
          icon={<CheckCircle2Icon className="size-4 text-muted-foreground" />}
          loading={loading}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput
            placeholder="Filter by actor username..."
            value={actorSearch}
            onValueChange={setActorSearch}
            className="w-full sm:w-60 text-xs"
          />
          <SimpleSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
            aria-label="Filter by status"
            className="w-36 text-xs"
          />
          <SimpleSelect
            value={targetTypeFilter}
            onValueChange={setTargetTypeFilter}
            options={TARGET_TYPE_OPTIONS}
            aria-label="Filter by target resource"
            className="w-40 text-xs"
          />
          <SimpleSelect
            value={actionFilter}
            onValueChange={setActionFilter}
            options={ACTION_OPTIONS}
            aria-label="Filter by specific action"
            className="w-52 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton columns={7} />
      ) : error && logs.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon />}
          title="No audit logs found"
          description="No event matches the current filter criteria or the log is empty."
          action={
            actionFilter !== "all" ||
            statusFilter !== "all" ||
            targetTypeFilter !== "all" ||
            actorSearch ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionFilter("all");
                  setStatusFilter("all");
                  setTargetTypeFilter("all");
                  setActorSearch("");
                }}
              >
                Clear all filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={entry.action} />
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-foreground">
                      {entry.actorUsername || "system"}
                    </div>
                    {entry.actorRole && (
                      <div className="text-[10px] text-muted-foreground uppercase font-mono">
                        {entry.actorRole}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-44">
                    <div className="text-xs font-mono font-medium text-foreground">
                      {entry.targetType || "-"}
                    </div>
                    {entry.targetId && (
                      <div
                        className="truncate text-[11px] font-mono text-muted-foreground"
                        title={entry.targetId}
                      >
                        {entry.targetId.length > 18
                          ? `${entry.targetId.slice(0, 16)}...`
                          : entry.targetId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <AuditStatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.ipAddress || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setSelectedEntry(entry)}
                            aria-label="Inspect audit log details"
                          />
                        }
                      >
                        <EyeIcon />
                      </TooltipTrigger>
                      <TooltipContent>Inspect payload</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataPagination state={pagination} itemLabel="log event" />
        </div>
      )}

      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{selectedEntry?.id}</span>
              {selectedEntry && <AuditStatusBadge status={selectedEntry.status} />}
            </DialogTitle>
            <DialogDescription>
              Action:{" "}
              <span className="font-mono font-medium text-foreground">{selectedEntry?.action}</span>
              {" · "}
              Actor:{" "}
              <span className="font-medium text-foreground">
                {selectedEntry?.actorUsername || "system"}
              </span>
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="flex flex-col gap-4 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-[11px]">
                <div>
                  <span className="block text-muted-foreground font-medium">Timestamp</span>
                  <span className="font-mono">
                    {new Date(selectedEntry.createdAt).toISOString()}
                  </span>
                </div>
                <div>
                  <span className="block text-muted-foreground font-medium">IP Address</span>
                  <span className="font-mono">{selectedEntry.ipAddress || "None"}</span>
                </div>
                <div>
                  <span className="block text-muted-foreground font-medium">Target Type</span>
                  <span className="font-mono">{selectedEntry.targetType || "None"}</span>
                </div>
                <div>
                  <span className="block text-muted-foreground font-medium">Target ID</span>
                  <span className="font-mono break-all">{selectedEntry.targetId || "None"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-muted-foreground font-medium">User Agent</span>
                  <span className="font-mono break-all text-[10px] text-muted-foreground">
                    {selectedEntry.userAgent || "None"}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-semibold text-muted-foreground">Payload Details</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => copyDetails(selectedEntry)}
                    aria-label="Copy payload JSON"
                    className="gap-1 text-[11px]"
                  >
                    {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                  {JSON.stringify(selectedEntry.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
  valueClassName,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={cn("font-mono text-2xl font-bold", valueClassName)}>{value}</div>
        )}
        {hint && !loading && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success text-[10px]">
        <CheckCircle2Icon className="size-3" /> Success
      </Badge>
    );
  }
  if (status === "failure") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <XCircleIcon className="size-3" /> Failure
      </Badge>
    );
  }
  if (status === "locked") {
    return (
      <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning text-[10px]">
        <LockIcon className="size-3" /> Locked
      </Badge>
    );
  }
  if (status === "blocked") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]"
      >
        <AlertTriangleIcon className="size-3" /> Blocked
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {status}
    </Badge>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (action.startsWith("auth.login.failure") || action.startsWith("auth.login.locked")) {
    return (
      <Badge variant="destructive" className="font-mono text-[10px]">
        {action}
      </Badge>
    );
  }
  if (action.startsWith("contest.")) {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary">
        {action}
      </Badge>
    );
  }
  if (action.startsWith("user.delete") || action.startsWith("user.suspend")) {
    return (
      <Badge
        variant="outline"
        className="font-mono text-[10px] border-destructive/40 text-destructive"
      >
        {action}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-mono text-[10px]">
      {action}
    </Badge>
  );
}
