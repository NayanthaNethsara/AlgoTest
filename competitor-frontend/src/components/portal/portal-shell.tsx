"use client";

import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { SubmissionsProvider, useSubmissions } from "@/components/providers/submissions-context";
import { ProctorProvider } from "@/components/providers/proctor-provider";
import { ProctorLockBanner } from "@/components/portal/proctor-status";
import { AccessBlockScreen } from "@/components/portal/access-block";
import { TopNav } from "@/components/portal/top-nav";
import type { SessionUser } from "@/lib/auth/constants";

export function PortalShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <ProctorProvider>
      <SubmissionsProvider>
        <div className="flex h-dvh flex-col">
          <TopNav user={user} />
          <div className="relative min-h-0 flex-1">
            {children}
            <ProctorLockBanner />
            {/* Over the banner, and only for the lock an organizer has to clear. */}
            <AccessBlockScreen />
            <ToastBanner />
          </div>
        </div>
      </SubmissionsProvider>
    </ProctorProvider>
  );
}

function ToastBanner() {
  const { toast, clearToast } = useSubmissions();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearToast(), 5000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  const isSuccess = toast.variant === "success";
  const isError = toast.variant === "error";

  return (
    <div className="pixel-raised absolute right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 bg-card p-4 animate-in slide-in-from-bottom-2">
      {isSuccess && <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />}
      {isError && <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />}
      {!isSuccess && !isError && <Info className="size-5 text-primary shrink-0 mt-0.5" />}

      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-pixel-header text-[10px] tracking-wider uppercase text-foreground">
          {toast.title}
        </span>
        <span className="text-muted-foreground">{toast.description}</span>
      </div>

      <button
        onClick={clearToast}
        className="ml-auto text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
