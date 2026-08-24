"use client";

import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AccessBlockScreen } from "@/components/portal/access-block";
import { ContestPhaseBanner } from "@/components/portal/contest-phase-banner";
import { ContestProvider } from "@/components/portal/contest-provider";
import { ProctorProvider } from "@/components/portal/proctor-provider";
import { ProctorLockBanner } from "@/components/portal/proctor-status";
import { useContest } from "@/components/portal/contest-provider";
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
  const { toast: submissionToast, clearToast: clearSubmissionToast } =
    useSubmissions();
  const { alertToast: contestToast, clearAlertToast: clearContestToast } =
    useContest();

  useEffect(() => {
    if (!submissionToast) return;
    const timer = setTimeout(() => clearSubmissionToast(), 5000);
    return () => clearTimeout(timer);
  }, [submissionToast, clearSubmissionToast]);

  useEffect(() => {
    if (!contestToast) return;
    const timer = setTimeout(() => clearContestToast(), 6000);
    return () => clearTimeout(timer);
  }, [contestToast, clearContestToast]);

  const activeToast = submissionToast
    ? {
        id: submissionToast.id,
        title: submissionToast.title,
        description: submissionToast.description,
        variant: submissionToast.variant,
        onClose: clearSubmissionToast,
      }
    : contestToast
      ? {
          id: contestToast.id,
          title: contestToast.title,
          description: contestToast.description,
          variant: contestToast.variant,
          onClose: clearContestToast,
        }
      : null;

  if (!activeToast) return null;

  const isSuccess = activeToast.variant === "success";
  const isError =
    activeToast.variant === "error" || activeToast.variant === "destructive";
  const isWarning = activeToast.variant === "warning";

  return (
    <div className="pixel-raised absolute right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 bg-card p-4 animate-in slide-in-from-bottom-2">
      {isSuccess && (
        <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
      )}
      {isError && (
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
      )}
      {isWarning && (
        <AlertCircle className="size-5 text-amber-400 shrink-0 mt-0.5" />
      )}
      {!isSuccess && !isError && !isWarning && (
        <Info className="size-5 text-primary shrink-0 mt-0.5" />
      )}

      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-semibold text-foreground">
          {activeToast.title}
        </span>
        <span className="text-muted-foreground">{activeToast.description}</span>
      </div>

      <button
        type="button"
        onClick={activeToast.onClose}
        className="ml-auto text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
