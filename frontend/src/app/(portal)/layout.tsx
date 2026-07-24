import { TopNav } from "@/components/portal/top-nav";
import { getSessionUser } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <div className="flex h-dvh flex-col">
      <TopNav user={user} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
