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

const STATUS_OPTIONS = ["ALL", "ONLINE", "STALE", "OFFLINE", "GAP"];

const HEADERS = [
  "Contestant",
  "Mode",
  "Status",
  "Dark for",
  "Machine / IP",
  "Proctor client",
  "Signals",
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

  return (
    <div className="space-y-6">
      <MonitoringFilters options={STATUS_OPTIONS} />

      {!loaded.telemetry ? (
        <TableSkeleton headers={HEADERS} />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={HEADERS.length} className="p-8 text-center text-muted-foreground">
                    No contestant heartbeats match your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
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
      )}
    </div>
  );
}
