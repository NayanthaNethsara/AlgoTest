import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { History, CheckCircle2, XCircle } from "lucide-react";

export default async function SubmissionsPage() {
  const currentUser = await getSessionUser();

  const submissions = [
    {
      id: "sub-101",
      problemTitle: "Two Sum",
      submittedBy: currentUser?.displayName || currentUser?.username || "Competitor",
      teamName: currentUser?.teamName || "Alpha Coders",
      language: "Python 3",
      execTime: "42 ms",
      status: "Accepted",
      submittedAt: "10 minutes ago",
    },
    {
      id: "sub-102",
      problemTitle: "Binary Tree Level Order Traversal",
      submittedBy: currentUser?.displayName || currentUser?.username || "Competitor",
      teamName: currentUser?.teamName || "Alpha Coders",
      language: "C++ 20",
      execTime: "12 ms",
      status: "Accepted",
      submittedAt: "1 hour ago",
    },
    {
      id: "sub-103",
      problemTitle: "Longest Substring Without Repeating Characters",
      submittedBy: currentUser?.displayName || currentUser?.username || "Competitor",
      teamName: currentUser?.teamName || "Alpha Coders",
      language: "Python 3",
      execTime: "115 ms",
      status: "Wrong Answer",
      submittedAt: "3 hours ago",
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Submissions Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Submission History</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Recent solution submissions and execution outcomes for your team.
        </p>
      </div>

      {/* Submissions Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground font-medium">
              <th className="p-3.5">Problem</th>
              <th className="p-3.5">Team</th>
              <th className="p-3.5">Language</th>
              <th className="p-3.5">Exec Time</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Submitted At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {submissions.map((sub) => {
              const isAccepted = sub.status === "Accepted";

              return (
                <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5 font-semibold text-xs text-foreground">
                    {sub.problemTitle}
                  </td>
                  <td className="p-3.5 font-mono text-xs text-muted-foreground">
                    {sub.teamName}
                  </td>
                  <td className="p-3.5 font-mono text-xs">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {sub.language}
                    </Badge>
                  </td>
                  <td className="p-3.5 font-mono text-xs text-muted-foreground">
                    {sub.execTime}
                  </td>
                  <td className="p-3.5">
                    <Badge
                      variant="secondary"
                      className={`gap-1 text-[11px] font-medium ${
                        isAccepted
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isAccepted ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {sub.status}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-right text-xs text-muted-foreground">
                    {sub.submittedAt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
