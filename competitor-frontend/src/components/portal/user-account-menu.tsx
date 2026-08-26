"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, KeyRound, LogOut, Users } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { useProctor } from "@/components/portal/proctor-provider";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth/constants";
import { isDesktopClient } from "@/lib/desktop";
import { stopLocalAgent } from "@/lib/proctor";

export function UserAccountMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { local } = useProctor();
  const [isOpen, setIsOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsConfirmingSignOut(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsConfirmingSignOut(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      try {
        await logoutAction();
      } catch {
        // Ignore network errors during session revocation cleanup
      }

      if (isDesktopClient()) {
        await stopLocalAgent(local?.loopback_port);
      }

      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
      setIsConfirmingSignOut(false);
      setIsOpen(false);
    }
  }

  const initialLetter = (user.displayName || user.username || "U")[0].toUpperCase();
  const displayName = user.displayName || user.username;

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        id="user-menu-trigger"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setIsConfirmingSignOut(false);
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={`Signed in as ${displayName}`}
        className="flex items-center gap-1.5 p-0.5 pixel-flat bg-card hover:bg-muted text-foreground transition-colors cursor-pointer select-none shrink-0"
      >
        <div className="flex h-6 w-6 items-center justify-center pixel-flat bg-primary text-primary-foreground font-bold text-xs shrink-0">
          {initialLetter}
        </div>
        <span className="text-xs font-semibold text-foreground max-w-[90px] truncate hidden 2xl:inline pl-0.5">
          {displayName}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform duration-150 mr-1 ${
            isOpen ? "rotate-180 text-foreground" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1.5 z-50 w-56 pixel-raised bg-card p-2 text-xs shadow-xl animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {/* User Profile Header */}
          <div className="flex items-center gap-2.5 p-2 border-b-2 border-black/40 pb-2.5 mb-1.5">
            <div className="flex h-7 w-7 items-center justify-center pixel-flat bg-primary text-primary-foreground font-bold text-xs shrink-0">
              {initialLetter}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-foreground truncate text-xs leading-snug">
                {displayName}
              </span>
              {user.username && user.displayName && (
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  @{user.username}
                </span>
              )}
            </div>
          </div>

          {/* User Team / Solo Status Info */}
          <div className="px-2 py-1.5 flex items-center justify-between gap-2 bg-muted/40 pixel-flat mb-1.5">
            <span className="text-[11px] text-muted-foreground font-semibold">Team:</span>
            {user.teamName ? (
              <Badge
                variant="secondary"
                className="gap-1 text-[11px] h-6 px-2 bg-card border border-border truncate max-w-[140px]"
                title={user.teamName}
              >
                <Users className="h-3 w-3 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {user.teamName}
                </span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[11px] text-muted-foreground h-6 px-2"
              >
                Solo
              </Badge>
            )}
          </div>

          <div className="pixel-divider my-1.5" />

          {/* Change Password Item */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setPasswordDialogOpen(true);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-muted pixel-flat text-left transition-colors cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>Change Password</span>
          </button>

          {/* Sign Out Item */}
          {!isConfirmingSignOut ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (isDesktopClient()) {
                  setIsConfirmingSignOut(true);
                } else {
                  void handleSignOut();
                }
              }}
              disabled={isSigningOut}
              className="w-full flex items-center gap-2 px-2 py-1.5 mt-0.5 text-xs text-destructive hover:bg-destructive/15 pixel-flat text-left transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span>{isSigningOut ? "Signing out…" : "Sign Out"}</span>
            </button>
          ) : (
            <div className="mt-1 p-1.5 bg-destructive/10 border-2 border-destructive/40 flex flex-col gap-1.5 animate-in fade-in-50">
              <span className="text-[11px] font-semibold text-destructive">
                Confirm sign out?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsConfirmingSignOut(false)}
                  disabled={isSigningOut}
                  className="flex-1 pixel-flat bg-card hover:bg-muted py-1 text-[11px] font-semibold text-foreground cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex-1 pixel-flat bg-destructive text-white py-1 text-[11px] font-semibold hover:opacity-90 cursor-pointer text-center"
                >
                  {isSigningOut ? "…" : "Sign Out"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
      />
    </div>
  );
}
