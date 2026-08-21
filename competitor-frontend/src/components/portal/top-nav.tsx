"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, History, Loader2, Menu, Trophy, Users, X } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="relative z-20 border-b-2 border-black bg-card px-4 py-2.5 shadow-[0px_4px_0px_var(--edge)] sm:px-6 lg:px-7 lg:py-3">
      <div className="flex items-center justify-between">
        {/* Brand & Desktop Nav */}
        <div className="flex items-center gap-4 md:gap-6 lg:gap-7">
          <Link
            href="/challenges"
            className="flex items-center hover:opacity-90 transition-opacity"
            onClick={() => setMobileOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/mini-algothon.svg"
              alt="MiniAlgothon"
              className="h-5.5 sm:h-6 lg:h-6 w-auto object-contain"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 border-l-2 border-black pl-5 lg:pl-6">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Right Section */}
        {user && (
          <div className="hidden md:flex items-center gap-3 lg:gap-3.5">
            <ProctorPill />

            {/* Active Submission Pill */}
            {activeSubmission && (
              <Badge
                variant="outline"
                className="gap-1.5 border-primary bg-primary/20 text-primary text-xs h-7.5 lg:h-8 px-2.5 animate-pulse"
              >
                <Loader2 className="h-3.5 w-3.5 pixel-spin" />
                <span>
                  {activeSubmission.status === "queued"
                    ? `Queued #${activeSubmission.queuePosition ?? 1}`
                    : "Evaluating..."}
                </span>
              </Badge>
            )}

            {/* Team Name Badge */}
            {user.teamName ? (
              <Badge variant="secondary" className="gap-1.5 text-xs h-7.5 lg:h-8 px-2.5 bg-muted">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-foreground">{user.teamName}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground h-7.5 lg:h-8 px-2.5">
                No team
              </Badge>
            )}

            {/* User Profile */}
            <div className="flex items-center gap-2 border-l-2 border-black pl-3">
              <div className="flex h-6.5 w-6.5 items-center justify-center pixel-flat bg-primary text-primary-foreground font-bold text-xs">
                {(user.displayName || user.username || "U")[0].toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-foreground">
                {user.displayName || user.username}
              </span>
            </div>

            <SignOutButton />
          </div>
        )}

        {/* Mobile Header Controls */}
        <div className="flex md:hidden items-center gap-2">
          {user && <ProctorPill />}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="flex h-8.5 w-8.5 items-center justify-center pixel-raised pixel-press bg-card text-foreground"
          >
            {mobileOpen ? <X className="h-4.5 w-4.5 text-destructive" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="md:hidden mt-3 border-t-2 border-black pt-3 pb-2 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 border-l-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className="flex flex-col gap-2.5 border-t-2 border-border pt-3">
              {/* Active Submission Pill */}
              {activeSubmission && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Submission:</span>
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-primary bg-primary/20 text-primary text-[11px] h-7 px-2.5 animate-pulse"
                  >
                    <Loader2 className="h-3 w-3 pixel-spin" />
                    <span>
                      {activeSubmission.status === "queued"
                        ? `Queued #${activeSubmission.queuePosition ?? 1}`
                        : "Evaluating..."}
                    </span>
                  </Badge>
                </div>
              )}

              {/* Team Name */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Team:</span>
                {user.teamName ? (
                  <Badge variant="secondary" className="gap-1.5 text-xs h-7 px-2.5 bg-muted">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-foreground">{user.teamName}</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground h-7 px-2.5">
                    No team
                  </Badge>
                )}
              </div>

              {/* User Profile & Sign Out */}
              <div className="flex items-center justify-between border-t-2 border-border pt-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center pixel-flat bg-primary text-primary-foreground font-bold text-[10px]">
                    {(user.displayName || user.username || "U")[0].toUpperCase()}
                  </div>
                  <span className="text-xs text-foreground font-semibold">
                    {user.displayName || user.username}
                  </span>
                </div>
                <SignOutButton />
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
