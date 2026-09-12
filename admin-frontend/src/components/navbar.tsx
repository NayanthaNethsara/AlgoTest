"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  FileCode2,
  History,
  LogOut,
  Menu,
  RefreshCw,
  Timer,
  Users,
  Users2,
  X,
} from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/types/user";
import { Button, buttonVariants } from "@/components/ui/button";

export function AdminNavbar({ user, onRefresh }: { user: User; onRefresh?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const isTimerActive = pathname === "/timer" || pathname.startsWith("/timer");

  const navLinks = [
    { href: "/", label: "Problems", shortLabel: "Problems", icon: FileCode2, active: isProblemsActive },
    { href: "/users", label: "Users", shortLabel: "Users", icon: Users, active: isUsersActive },
    { href: "/teams", label: "Teams", shortLabel: "Teams", icon: Users2, active: isTeamsActive },
    {
      href: "/submissions",
      label: "Submissions & Judge",
      shortLabel: "Submissions",
      icon: History,
      active: isSubmissionsActive,
    },
    {
      href: "/monitoring",
      label: "Onsite Monitoring",
      shortLabel: "Monitoring",
      icon: Activity,
      active: isMonitoringActive,
    },
    {
      href: "/timer",
      label: "Contest Timer",
      shortLabel: "Timer",
      icon: Timer,
      active: isTimerActive,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-card/90 backdrop-blur-xl transition-all shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 py-2">
          {/* Brand & Desktop Navigation */}
          <div className="flex items-center gap-3 xl:gap-6 min-w-0">
            <Link href="/" className="flex flex-col transition-opacity hover:opacity-90 shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-sm font-bold tracking-tight text-foreground">MiniAlgothon</span>
                <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-muted-foreground leading-tight truncate max-w-[140px]">
                <span className="font-medium text-foreground/90">
                  {user.displayName || user.username}
                </span>
              </p>
            </Link>

            {/* Desktop Navigation Links (Visible on lg and above) */}
            <nav className="hidden lg:flex items-center gap-1 border-l border-white/10 pl-3 xl:pl-5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={buttonVariants({
                      variant: link.active ? "default" : "ghost",
                      size: "sm",
                      className: `gap-1.5 text-xs h-8 px-2.5 xl:px-3 font-medium transition-all ${
                        link.active
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      }`,
                    })}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">{link.label}</span>
                    <span className="xl:hidden">{link.shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden lg:flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-8 gap-1.5 text-xs border-white/10 bg-white/5 hover:bg-white/10 hover:text-foreground transition-all cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/15 hover:text-destructive border-destructive/20 bg-destructive/5 transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </Button>
          </div>

          {/* Mobile & Tablet Action Buttons */}
          <div className="flex lg:hidden items-center gap-1.5 sm:gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Refresh Data"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="h-9 w-9 text-foreground hover:bg-white/10"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile & Tablet Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-card/95 backdrop-blur-2xl px-4 py-4 lg:hidden animate-in slide-in-from-top-2 duration-150">
            <div className="mb-3 px-2 flex items-center justify-between pb-2 border-b border-white/5">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-foreground truncate">
                  {user.displayName || user.username}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">{user.role}</p>
              </div>
              <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium shrink-0">
                Active Session
              </span>
            </div>

            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                      link.active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="w-full justify-center gap-2 text-xs text-destructive hover:bg-destructive/15 hover:text-destructive border-destructive/20 bg-destructive/5 h-9"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out of Admin Console
              </Button>
            </div>
          </div>
        )}
      </header>
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
