"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { revokeUserSession } from "@mini-algothon/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await revokeUserSession();
      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
