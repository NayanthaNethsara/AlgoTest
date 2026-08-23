"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";

import { useMonitoring } from "@/components/monitoring/monitoring-context";

/**
 * Search box plus the status chips for the current section.
 *
 * The chip set differs per page (ONLINE/STALE/... for telemetry, HIGH/MEDIUM/LOW
 * for risk), so a filter carried across a navigation could leave a page with a
 * value none of its chips offer and no visible way to clear it. Anything not in
 * `options` resets to ALL.
 */
export function MonitoringFilters({
  options,
  placeholder = "Search contestant by name, username...",
}: {
  options: string[];
  placeholder?: string;
}) {
  const { searchQuery, setSearchQuery, statusFilter, setStatusFilter } = useMonitoring();

  useEffect(() => {
    if (!options.includes(statusFilter)) setStatusFilter("ALL");
  }, [options, statusFilter, setStatusFilter]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-xs rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => setStatusFilter(option)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === option
                ? "bg-secondary text-secondary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
