"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, FileCode2, History, LogOut, RefreshCw, Users, Users2 } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/types/user";
import { Button, buttonVariants } from "@/components/ui/button";

export function AdminNavbar({ user, onRefresh }: { user: User; onRefresh?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  const isProblemsActive = pathname === "/" || pathname.startsWith("/problems");
  const isUsersActive = pathname.startsWith("/users");
  const isTeamsActive = pathname.startsWith("/teams");
  const isSubmissionsActive = pathname.startsWith("/submissions");
  const isMonitoringActive = pathname.startsWith("/monitoring");

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/90 backdrop-blur-md px-6 py-2.5 shadow-xs">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex flex-col transition-opacity hover:opacity-90">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight">MiniAlgothon</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
              Admin
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            <span className="font-medium text-foreground">{user.displayName || user.username}</span>
          </p>
        </Link>

        <nav className="flex items-center gap-1 border-l pl-5">
          <Link
            href="/"
            className={buttonVariants({
              variant: isProblemsActive ? "default" : "ghost",
              size: "sm",
              className: "gap-1.5 text-xs h-8 font-medium transition-all",
            })}
          >
            <FileCode2 className="h-3.5 w-3.5" /> Problems
          </Link>

          <Link
            href="/users"
            className={buttonVariants({
              variant: isUsersActive ? "default" : "ghost",
              size: "sm",
              className: "gap-1.5 text-xs h-8 font-medium transition-all",
            })}
          >
            <Users className="h-3.5 w-3.5" /> Users
          </Link>

          <Link
            href="/teams"
            className={buttonVariants({
              variant: isTeamsActive ? "default" : "ghost",
              size: "sm",
              className: "gap-1.5 text-xs h-8 font-medium transition-all",
            })}
          >
            <Users2 className="h-3.5 w-3.5" /> Teams
          </Link>

          <Link
            href="/submissions"
            className={buttonVariants({
              variant: isSubmissionsActive ? "default" : "ghost",
              size: "sm",
              className: "gap-1.5 text-xs h-8 font-medium transition-all",
            })}
          >
            <History className="h-3.5 w-3.5" /> Submissions & Judge
          </Link>

          <Link
            href="/monitoring"
            className={buttonVariants({
              variant: isMonitoringActive ? "default" : "ghost",
              size: "sm",
              className: "gap-1.5 text-xs h-8 font-medium transition-all",
            })}
          >
            <Activity className="h-3.5 w-3.5" /> Onsite Monitoring
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
        >
          <LogOut className="h-3.5 w-3.5" /> Logout
        </Button>
      </div>
    </header>
  );
}
