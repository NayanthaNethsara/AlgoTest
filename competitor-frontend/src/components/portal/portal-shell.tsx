"use client";

import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AccessBlockScreen } from "@/components/portal/access-block";
import { ContestPhaseBanner } from "@/components/portal/contest-phase-banner";
import { ContestProvider } from "@/components/portal/contest-provider";
import { ProctorProvider } from "@/components/portal/proctor-provider";
import { ProctorLockBanner } from "@/components/portal/proctor-status";
import {
  SubmissionsProvider,
  useSubmissions,
} from "@/components/portal/submissions-provider";
import { TopNav } from "@/components/portal/top-nav";
import type { SessionUser } from "@/lib/auth/constants";
import type { ContestState } from "@/types/contest";
import type { ProctorSelfStatus } from "@/types/proctor";

export function PortalShell({
  user,
  initialProctor,
  initialContest,
  children,
}: {
  user: SessionUser | null;
  initialProctor: ProctorSelfStatus | null;
  initialContest: ContestState;
  children: React.ReactNode;
}) {
  return (
    <ContestProvider initialState={initialContest}>
      <ProctorProvider initialProctor={initialProctor}>
        <SubmissionsProvider>
          <div className="flex h-dvh flex-col">
            <TopNav user={user} />
            <ContestPhaseBanner />
            <div className="relative min-h-0 flex-1">
              {children}
              <ProctorLockBanner />
              <AccessBlockScreen />
              <ToastBanner />
            </div>
          </div>
        </SubmissionsProvider>
      </ProctorProvider>
    </ContestProvider>
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
      {isSuccess && (
        <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
      )}
      {isError && (
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
      )}
      {!isSuccess && !isError && (
        <Info className="size-5 text-primary shrink-0 mt-0.5" />
      )}

      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-semibold text-foreground">{toast.title}</span>
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
