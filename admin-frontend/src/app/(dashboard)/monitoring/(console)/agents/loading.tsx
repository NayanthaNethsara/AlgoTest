import { TableSkeleton } from "@/components/monitoring/skeletons";

export default function Loading() {
  return (
    <TableSkeleton
      headers={[
        "State",
        "Contestant",
        "Machine",
        "Platform & version",
        "Enrolled",
        "Last report",
        "",
      ]}
      subLineIndex={1}
    />
  );
}
