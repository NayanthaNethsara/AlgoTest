import { redirect } from "next/navigation";
import { getSessionUserAction } from "@/lib/actions/auth";
import { ContestControlBar } from "@/components/contest/contest-control-bar";
import { AdminNavbar } from "@/components/navbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserAction();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AdminNavbar user={user} />
      <ContestControlBar />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
