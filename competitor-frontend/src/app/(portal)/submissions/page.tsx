import { getSessionUser } from "@/lib/auth/session";
import { listSubmissionsAction } from "@/actions/code";
import { SubmissionsClient } from "@/components/submissions/submissions-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";

export default async function SubmissionsPage() {
  const [currentUser, submissions] = await Promise.all([
    getSessionUser(),
    listSubmissionsAction(),
  ]);

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-8 font-pixel-body">
        {/* Sleek Page Header */}
        <div className="flex flex-col gap-1 border-b-2 border-black/40 pb-3">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-primary" />
            <h1 className="font-pixel-header text-sm sm:text-base uppercase tracking-wider text-primary pixel-text-shadow">
              SUBMISSION HISTORY
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
