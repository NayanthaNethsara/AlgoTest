import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { getSessionUser } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <PortalShell user={user}>{children}</PortalShell>;
}
