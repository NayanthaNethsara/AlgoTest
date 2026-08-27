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
    { href: "/", label: "Problems", icon: FileCode2, active: isProblemsActive },
    { href: "/users", label: "Users", icon: Users, active: isUsersActive },
    { href: "/teams", label: "Teams", icon: Users2, active: isTeamsActive },
    {
      href: "/submissions",
      label: "Submissions & Judge",
      icon: History,
      active: isSubmissionsActive,
    },
    { href: "/monitoring", label: "Onsite Monitoring", icon: Activity, active: isMonitoringActive },
    { href: "/timer", label: "Contest Timer", icon: Timer, active: isTimerActive },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-card/85 backdrop-blur-xl transition-all shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-2.5">
        {/* Brand & Desktop Navigation */}
        <div className="flex items-center gap-4 lg:gap-6">
          <Link href="/" className="flex flex-col transition-opacity hover:opacity-90">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-foreground">MiniAlgothon</span>
              <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                Admin
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-muted-foreground leading-tight">
              <span className="font-medium text-foreground/90">
                {user.displayName || user.username}
              </span>
            </p>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-white/10 pl-4 lg:pl-5">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={buttonVariants({
                    variant: link.active ? "default" : "ghost",
                    size: "sm",
                    className: `gap-1.5 text-xs h-8 font-medium transition-all ${
                      link.active
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`,
                  })}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Action Buttons */}
        <div className="hidden md:flex items-center gap-2.5">
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

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
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
            className="h-8 w-8 text-foreground hover:bg-white/10"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Slide-Down Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-card/95 backdrop-blur-2xl px-4 py-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <div className="mb-3 px-2 flex items-center justify-between pb-2 border-b border-white/5">
            <div>
              <p className="text-xs font-semibold text-foreground">
                {user.displayName || user.username}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">{user.role}</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium">
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
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
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
              className="w-full justify-center gap-2 text-xs text-destructive hover:bg-destructive/15 hover:text-destructive border-destructive/20 bg-destructive/5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out of Admin Console
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
