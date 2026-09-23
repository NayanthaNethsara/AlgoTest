"use client";

import { AgentsTable } from "@/components/monitoring/agents-table";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { TableSkeleton } from "@/components/monitoring/skeletons";

const HEADERS = [
  "State",
  "Contestant",
  "Machine",
  "Platform & version",
  "Enrolled",
  "Last report",
  "",
];

export default function AgentsPage() {
  const { agents, loaded, refreshNow } = useMonitoring();

  // No filter bar here: the agents table carries its own columns and the
  // contestant search does not apply to enrollment history.
  if (!loaded.agents) return <TableSkeleton headers={HEADERS} subLineIndex={1} />;

  return <AgentsTable agents={agents} onChanged={refreshNow} />;
}
