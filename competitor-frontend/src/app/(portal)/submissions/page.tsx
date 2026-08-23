import { listSubmissionsAction } from "@/actions/code";
import { readProctorGate } from "@/lib/proctor-gate";
import { proctorLocksContest } from "@/lib/proctor";
import { SubmissionsClient } from "@/components/submissions/submissions-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";

export default async function SubmissionsPage() {
  if (proctorLocksContest(await readProctorGate())) return null;

  const submissions = await listSubmissionsAction();

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
        {/* Sleek Page Header */}
        <div className="flex flex-col gap-1 border-b-2 border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              Submission History
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Log of recent attempts and system evaluation results.
          </p>
        </div>

        {/* Real Backend Submissions Table with Sorting & Filters */}
        <SubmissionsClient submissions={submissions} />
      </div>
    </ScrollArea>
  );
}
