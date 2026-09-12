"use client";

import { useEffect } from "react";

import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { SearchInput } from "@/components/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  placeholder = "Search contestant by name or username…",
}: {
  options: string[];
  placeholder?: string;
}) {
  const { searchQuery, setSearchQuery, statusFilter, setStatusFilter } = useMonitoring();

  useEffect(() => {
    if (!options.includes(statusFilter)) setStatusFilter("ALL");
  }, [options, statusFilter, setStatusFilter]);

  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <SearchInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder={placeholder}
        className="sm:max-w-md"
      />

      <ToggleGroup
        value={[statusFilter]}
        // The group is multi-select by default; keep the newly pressed chip and
        // ignore a press that would clear the selection entirely.
        onValueChange={(next) =>
          setStatusFilter(next.find((v) => v !== statusFilter) ?? statusFilter)
        }
        aria-label="Filter by status"
        className="flex-wrap"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} className="text-xs">
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
