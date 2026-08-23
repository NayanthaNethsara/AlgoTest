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
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    );
  }

  if (!isConfirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setIsConfirming(true)}>
        <LogOut className="size-4" />
        Sign out
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
        Stops proctoring · closes the app
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsConfirming(false)}
        disabled={isSigningOut}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        <LogOut className="size-4" />
        {isSigningOut ? "Signing out…" : "Confirm"}
      </Button>
    </div>
  );
}
