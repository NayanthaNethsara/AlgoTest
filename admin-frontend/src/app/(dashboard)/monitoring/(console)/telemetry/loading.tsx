import { TableSkeleton } from "@/components/monitoring/skeletons";

export default function Loading() {
  return (
    <TableSkeleton
      headers={[
        "Contestant",
        "Mode",
        "Status",
        "Dark for",
        "Machine / IP",
        "Proctor client",
        "Signals",
        "Last Heartbeat",
      ]}
    />
  );
}
