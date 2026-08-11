"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { revokeUserSession } from "@mini-algothon/auth";
import { Button } from "@/components/ui/button";
import { useProctor } from "@/components/providers/proctor-provider";
import { isDesktopClient } from "@/lib/desktop";
import { stopLocalAgent } from "@/lib/proctor";

/**
 * Signing out of the portal in a browser ends a web session and nothing else.
 * Signing out inside the desktop client ends the contest on this machine: it
 * stops proctoring, unenrols the machine, and closes the client completely.
 *
 * That is a bigger action than a menu item usually implies, so it asks first.
 */
export function SignOutButton() {
  const router = useRouter();
  const { local } = useProctor();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      // Revoke the server session first. The desktop stop closes this very window,
      // so anything left until afterwards may never run.
      await revokeUserSession();

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
      <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
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
      <span className="hidden text-[10px] font-pixel-body uppercase tracking-wider text-muted-foreground sm:inline">
        Stops proctoring · closes the app
      </span>
      <Button variant="ghost" size="sm" onClick={() => setIsConfirming(false)} disabled={isSigningOut}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
        <LogOut className="size-4" />
        {isSigningOut ? "Signing out…" : "Confirm"}
      </Button>
    </div>
  );
}
