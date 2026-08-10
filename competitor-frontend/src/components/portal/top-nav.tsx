"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, History, Loader2, Terminal, Trophy, Users } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ProctorPill } from "@/components/portal/proctor-status";
import { useSubmissions } from "@/components/providers/submissions-context";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth/constants";

const NAV_LINKS = [
  { href: "/challenges", label: "Challenges", icon: Code2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/submissions", label: "Submissions", icon: History },
];

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const { activeSubmission } = useSubmissions();

  return (
    <header className="flex items-center justify-between border-b-2 border-black bg-card px-6 py-2 shadow-[0px_4px_0px_#000000] z-20">
      <div className="flex items-center gap-6">
        <Link href="/challenges" className="flex items-center gap-2.5 font-pixel-header text-xs text-primary hover:opacity-90">
          <div className="flex h-7 w-7 items-center justify-center border-2 border-black bg-primary text-primary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.4),0px_2px_0px_#000000]">
            <Terminal className="h-4 w-4" />
          </div>
          <span className="tracking-wide text-foreground pixel-text-shadow">MINIALGOTHON</span>
        </Link>

        <nav className="flex items-center gap-2 border-l-2 border-black pl-6">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 border-2 px-3 py-1 text-xs font-pixel-body uppercase tracking-wider transition-all ${
                  active
                    ? "border-black bg-primary text-primary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.4),inset_-2px_-2px_0px_rgba(0,0,0,0.4),0px_2px_0px_#000000]"
                    : "border-transparent text-muted-foreground hover:border-black hover:bg-muted hover:text-foreground"
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
          <ProctorPill />

          {/* Active Submission Pill */}
          {activeSubmission && (
            <Badge
              variant="outline"
              className="gap-1.5 border-primary bg-primary/20 text-primary text-[11px] h-7 px-2.5 animate-pulse font-pixel-body"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {activeSubmission.status === "queued"
                  ? `QUEUED #${activeSubmission.queuePosition ?? 1}`
                  : "EVALUATING..."}
              </span>
            </Badge>
          )}

          {/* Team Name Badge */}
          {user.teamName ? (
            <Badge variant="secondary" className="gap-1.5 font-pixel-body text-xs h-7 px-2.5 border-black bg-muted">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="font-bold text-foreground uppercase">{user.teamName}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground h-7 font-pixel-body">
              NO TEAM
            </Badge>
          )}

          {/* User Profile */}
          <div className="flex items-center gap-2 border-l-2 border-black pl-3">
            <div className="flex h-6 w-6 items-center justify-center border border-black bg-primary text-primary-foreground font-pixel-header text-[10px]">
              {(user.displayName || user.username || "U")[0].toUpperCase()}
            </div>
            <span className="text-xs font-pixel-body uppercase text-foreground">
              {user.displayName || user.username}
            </span>
          </div>

          <SignOutButton />
        </div>
      )}
    </header>
  );
}
