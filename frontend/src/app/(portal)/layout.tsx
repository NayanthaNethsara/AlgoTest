import { redirect } from "next/navigation";
import { TopNav } from "@/components/portal/top-nav";
import { getSessionUser } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Defense in depth: proxy.ts already enforces this, but this covers any
  // portal route it doesn't (yet) match, or a backend blip during proxy.
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh flex-col">
      <TopNav user={user} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
