"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Loader2, Menu, RotateCw, Users, X } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { ContestTimer } from "@/components/portal/contest-timer";
import { ProctorPill } from "@/components/portal/proctor-status";
import { useSubmissions } from "@/components/portal/submissions-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "@/components/portal/user-account-menu";
import { DesktopWindowControls } from "./desktop-window-controls";
import type { SessionUser } from "@/lib/auth/constants";
import { NAV_LINKS } from "@/lib/constants";

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const { activeSubmission } = useSubmissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const handleReload = () => {
    setIsReloading(true);
    window.location.reload();
  };

  return (
    <header
      data-tauri-drag-region
      data-window-drag-region
      className="relative z-20 border-b-2 border-black bg-card px-2.5 sm:px-4 lg:px-6 py-2 sm:py-2.5 shadow-[0px_4px_0px_var(--edge)] select-none overscroll-none shrink-0"
    >
      <div
        data-tauri-drag-region
        data-window-drag-region
        className="flex items-center justify-between gap-1.5 sm:gap-3"
      >
        {/* Left Side: Logo & Navigation */}
        <div
          data-tauri-drag-region
          data-window-drag-region
          className="flex items-center gap-2 sm:gap-4 md:gap-5 lg:gap-6 shrink-0 min-w-0"
        >
          <Link
            href="/challenges"
            className="flex items-center hover:opacity-90 transition-opacity shrink-0"
            onClick={() => setMobileOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/mini-algothon.svg"
              alt="MiniAlgothon"
              className="h-5 sm:h-6 w-auto max-w-[130px] sm:max-w-none object-contain shrink-0"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 border-l-2 border-black pl-2.5 sm:pl-3 lg:pl-5">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={true}
                  title={link.label}
                  className={`flex items-center gap-1.5 border-b-2 px-2 lg:px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden xl:inline">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Wide Center Drag Handle Region */}
        <div
          data-tauri-drag-region
          data-window-drag-region
          className="flex-1 self-stretch min-h-6 min-w-2 cursor-default"
          aria-hidden="true"
        />

        {/* Right Side: Timer, User Info, Mobile Toggle & Desktop Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 lg:gap-2.5 shrink-0">
          <ContestTimer />

          {user && (
            <>
              <ProctorPill />

              {activeSubmission && (
                <Badge
                  variant="outline"
                  className="gap-1 border-primary bg-primary/20 text-primary text-xs h-7 px-1.5 sm:px-2 animate-pulse hidden lg:flex shrink-0"
                  title={activeSubmission.status === "queued" ? `Queued #${activeSubmission.queuePosition ?? 1}` : "Judging..."}
                >
                  <Loader2 className="h-3 w-3 pixel-spin" />
                  <span>
                    {activeSubmission.status === "queued"
                      ? `#${activeSubmission.queuePosition ?? 1}`
                      : "Judging"}
                  </span>
                </Badge>
              )}

              <div className="flex items-center gap-1 border-l-2 border-black pl-1.5 sm:pl-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReload}
                  disabled={isReloading}
                  title="Reload Portal"
                  aria-label="Reload Portal"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0 flex items-center justify-center pixel-flat bg-card hover:bg-muted cursor-pointer"
                >
                  <RotateCw className={`size-3.5 ${isReloading ? "pixel-spin" : ""}`} />
                </Button>

                <UserAccountMenu user={user} />
              </div>
            </>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="flex md:hidden h-7 w-7 items-center justify-center pixel-raised pixel-press bg-card text-foreground cursor-pointer shrink-0"
          >
            {mobileOpen ? (
              <X className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Menu className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Desktop Window Controls (Minimize, Maximize/Restore, Close) - ALWAYS visible & anchored to top right */}
          <DesktopWindowControls />
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
                  prefetch={true}
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
              {activeSubmission && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Submission:
                  </span>
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

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Team:</span>
                {user.teamName ? (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs h-7 px-2.5 bg-muted"
                  >
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-foreground">
                      {user.teamName}
                    </span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground h-7 px-2.5"
                  >
                    No team
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between border-t-2 border-border pt-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center pixel-flat bg-primary text-primary-foreground font-bold text-[10px]">
                    {(user.displayName ||
                      user.username ||
                      "U")[0].toUpperCase()}
                  </div>
                  <span className="text-xs text-foreground font-semibold">
                    {user.displayName || user.username}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReload}
                    disabled={isReloading}
                    title="Reload Portal"
                    className="h-8 px-2 text-xs"
                  >
                    <RotateCw className={`size-3.5 mr-1 ${isReloading ? "pixel-spin" : ""}`} />
                    Reload
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMobileOpen(false);
                      setPasswordDialogOpen(true);
                    }}
                    className="h-8 px-2 text-xs"
                  >
                    <KeyRound className="size-3.5 mr-1" />
                    Password
                  </Button>
                  <SignOutButton />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
      />
    </header>
  );
}
