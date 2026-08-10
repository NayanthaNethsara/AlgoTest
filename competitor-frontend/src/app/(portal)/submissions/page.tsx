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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 font-pixel-body">
      {/* Submissions Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-sm font-pixel-header uppercase tracking-wider text-primary pixel-text-shadow">
            SUBMISSION HISTORY
          </h1>
        </div>
        <p className="text-xs text-muted-foreground font-pixel-body">
          LOG OF RECENT ATTEMPTS AND SYSTEM EVALUATION RESULTS.
        </p>
      </div>

      {/* Submissions Table */}
      <div className="border-4 border-black bg-card shadow-[inset_3px_3px_0px_oklch(0.45_0.02_260),inset_-3px_-3px_0px_oklch(0.12_0.01_260),0px_6px_0px_#000000] overflow-hidden">
        <table className="w-full border-collapse text-left text-xs font-pixel-body">
          <thead>
            <tr className="border-b-2 border-black bg-muted text-foreground uppercase tracking-wider font-bold">
              <th className="p-3.5">CHALLENGE</th>
              <th className="p-3.5">GUILD / TEAM</th>
              <th className="p-3.5">LANG</th>
              <th className="p-3.5">TIME</th>
              <th className="p-3.5">STATUS</th>
              <th className="p-3.5 text-right">SUBMITTED</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-black">
            {submissions.map((sub) => {
              const isAccepted = sub.status === "Accepted";

              return (
                <tr key={sub.id} className="hover:bg-muted/40 transition-colors">
                  <td className="p-3.5 font-bold text-xs text-foreground uppercase">
                    {sub.problemTitle}
                  </td>
                  <td className="p-3.5 text-xs text-muted-foreground uppercase">
                    {sub.teamName}
                  </td>
                  <td className="p-3.5 text-xs">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase border-black bg-muted">
                      {sub.language}
                    </Badge>
                  </td>
                  <td className="p-3.5 font-mono text-xs text-muted-foreground">
                    {sub.execTime}
                  </td>
                  <td className="p-3.5">
                    <Badge
                      variant="secondary"
                      className={`gap-1.5 text-[10px] uppercase border font-pixel-body font-bold ${
                        isAccepted
                          ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                          : "bg-rose-950 text-rose-300 border-rose-500"
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
                  <td className="p-3.5 text-right text-xs text-muted-foreground uppercase">
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
