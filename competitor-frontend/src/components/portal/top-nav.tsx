"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, History, Loader2, Power, ShieldAlert, Terminal, Trophy, Users } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useSubmissions } from "@/components/providers/submissions-context";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth/constants";

const NAV_LINKS = [
  { href: "/challenges", label: "Challenges", icon: Code2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/submissions", label: "Submissions", icon: History },
  { href: "/monitoring", label: "Monitoring", icon: ShieldAlert, adminOnly: true },
];

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const { activeSubmission } = useSubmissions();
  const [isDesktopEnvironment, setIsDesktopEnvironment] = useState<boolean>(false);

  useEffect(() => {
    const isDesktop = typeof window !== "undefined" && Boolean(
      window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke
    );
    setIsDesktopEnvironment(isDesktop);
  }, []);

  const handleExitDesktopApplication = async () => {
    const invokeFn =
      window.__TAURI_INTERNALS__?.invoke ||
      window.__TAURI__?.core?.invoke;

    if (typeof invokeFn === "function") {
      try {
        await invokeFn("exit_app");
      } catch (err) {
        console.error("Failed to exit desktop application:", err);
      }
    }
  };

  return (
    <header className="flex items-center justify-between border-b bg-card px-6 py-2.5 shadow-sm">
      <div className="flex items-center gap-6">
        <Link href="/challenges" className="flex items-center gap-2 font-bold tracking-tight text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Terminal className="h-4 w-4" />
          </div>
          <span>MiniAlgothon</span>
        </Link>

        <nav className="flex items-center gap-1 border-l pl-6">
          {NAV_LINKS.filter((link) => !link.adminOnly || (user?.role as string) === "admin" || (user?.role as string) === "ADMIN").map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          {/* Active Submission Pill */}
          {activeSubmission && (
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/40 bg-primary/10 text-primary text-[11px] h-7 px-2.5 animate-pulse"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {activeSubmission.status === "queued"
                  ? `Queued #${activeSubmission.queuePosition ?? 1}`
                  : "Evaluating submission..."}
              </span>
            </Badge>
          )}

          {/* Team Name Badge */}
          {user.teamName ? (
            <Badge variant="secondary" className="gap-1.5 font-mono text-[11px] h-7 px-2.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-foreground">{user.teamName}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] text-muted-foreground h-7">
              No Team Assigned
            </Badge>
          )}

          {/* User Profile */}
          <div className="flex items-center gap-2 border-l pl-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {(user.displayName || user.username || "U")[0].toUpperCase()}
            </div>
            <span className="text-xs font-medium text-foreground">
              {user.displayName || user.username}
            </span>
          </div>

          <SignOutButton />

          {/* Exit Desktop Application Button */}
          {isDesktopEnvironment && (
            <button
              onClick={handleExitDesktopApplication}
              title="Exit Application"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors h-8"
            >
              <Power className="h-3.5 w-3.5" />
              Exit App
            </button>
          )}
        </div>
      )}
    </header>
  );
}
