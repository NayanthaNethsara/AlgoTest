"use client";

import Link from "next/link";

import {
  DarkForCell,
  ModeBadge,
  SignalsCell,
  StatusBadge,
  formatTimeAgo,
} from "@/components/monitoring/badges";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { MonitoringFilters } from "@/components/monitoring/monitoring-filters";
import { TableSkeleton } from "@/components/monitoring/skeletons";
import { DataPagination } from "@/components/shell/data-pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_OPTIONS = ["ALL", "ONLINE", "STALE", "OFFLINE", "GAP"];

const HEADERS = [
  "Contestant",
  "Mode",
  "Status",
  "Dark for",
  "Machine / IP",
  "Proctor client",
  "Active Focus & Processes",
  "Last Heartbeat",
];

export default function TelemetryPage() {
  const { telemetry, loaded, searchQuery, statusFilter } = useMonitoring();

  const filtered = telemetry.filter((item) => {
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query === "" ||
      item.username.toLowerCase().includes(query) ||
      item.display_name.toLowerCase().includes(query) ||
      (item.team_name && item.team_name.toLowerCase().includes(query)) ||
      item.ip_address.includes(searchQuery);
    return matchesStatus && matchesQuery;
  });

  const pagination = usePagination(filtered);

  return (
    <div className="flex flex-col gap-5">
      <MonitoringFilters options={STATUS_OPTIONS} />

      {!loaded.telemetry ? (
        <TableSkeleton headers={HEADERS} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {HEADERS.map((h) => (
                  <TableHead key={h} className="text-[11px] uppercase">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={HEADERS.length}
                    className="p-8 text-center text-xs text-muted-foreground"
                  >
                    No contestant heartbeat matches these filters.
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((item) => (
                  <TableRow key={item.user_id}>
                    <TableCell className="max-w-56">
                      <Link
                        href={`/monitoring/${item.user_id}`}
                        className="text-xs font-semibold hover:underline"
                      >
                        {item.display_name}
                      </Link>
                      <div className="truncate text-[11px] text-muted-foreground">
                        @{item.username}
                        {item.team_name && ` · ${item.team_name}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ModeBadge item={item} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} inGap={item.in_gap} />
                    </TableCell>
                    <TableCell>
                      <DarkForCell item={item} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {item.ip_address || "—"}
                    </TableCell>
                    <TableCell className="max-w-40 font-mono text-[11px] text-muted-foreground">
                      <div>{item.agent_version || "—"}</div>
                      {item.os_info && (
                        <div className="truncate text-[10px] opacity-70" title={item.os_info}>
                          {item.os_info}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <SignalsCell item={item} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTimeAgo(item.last_ping_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <DataPagination state={pagination} itemLabel="contestant" />
        </div>
      )}
    </div>
  );
}
