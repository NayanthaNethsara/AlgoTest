"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { useProctor } from "@/components/portal/proctor-provider";
import { Button } from "@/components/ui/button";
import { isDesktopClient } from "@/lib/desktop";
import { stopLocalAgent } from "@/lib/proctor";

export function SignOutButton() {
  const router = useRouter();
  const { local } = useProctor();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
      setIsConfirming(false);
    }
  }

  if (!isDesktopClient()) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
        title="Sign out"
        className="h-7.5 px-1.5 sm:px-2.5 text-xs shrink-0"
      >
        <LogOut className="size-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    );
  }

  if (!isConfirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsConfirming(true)}
        title="Sign out"
        className="h-7.5 px-1.5 sm:px-2.5 text-xs shrink-0"
      >
        <LogOut className="size-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0 z-50">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsConfirming(false)}
        disabled={isSigningOut}
        className="h-7.5 px-2 text-xs"
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="h-7.5 px-2 text-xs"
      >
        <LogOut className="size-3.5 sm:mr-1" />
        <span>{isSigningOut ? "Signing out…" : "Confirm"}</span>
      </Button>
    </div>
  );
}
