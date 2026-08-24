import { redirect } from "next/navigation";
import { getContestStateAction } from "@/actions/contest";
import { PortalShell } from "@/components/portal/portal-shell";
import { getSessionUser } from "@/lib/auth/session";
import { readProctorGate } from "@/lib/proctor-gate";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  // Resolved here rather than after hydration so a locked contestant is served the
  // lock screen in the first byte. Polling for it client-side meant every refresh
  // painted the workspace first and covered it a round trip later, which showed
  // them the thing the lock exists to withhold.
  const [proctor, contestState] = await Promise.all([
    readProctorGate(),
    getContestStateAction(),
  ]);

  return (
    <PortalShell
      user={user}
      initialProctor={proctor}
      initialContest={contestState}
    >
      {children}
    </PortalShell>
  );
}
