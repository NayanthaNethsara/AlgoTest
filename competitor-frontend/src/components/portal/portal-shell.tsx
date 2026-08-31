"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Wifi, WifiOff, X } from "lucide-react";
import { AccessBlockScreen } from "@/components/portal/access-block";
import { BrowserLockdownScreen } from "@/components/portal/browser-lockdown";
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
import { isDesktopClient } from "@/lib/desktop";
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
          <div className="flex h-dvh flex-col overflow-hidden overscroll-none">
            <TopNav user={user} />
            <NetworkStatusBanner />
            <ContestPhaseBanner />
            <div className="relative min-h-0 flex-1 overflow-hidden overscroll-contain">
              {children}
              <ProctorLockBanner />
              <AccessBlockScreen />
              <BrowserLockdownScreen user={user} />
              <ToastBanner />
            </div>
          </div>
        </SubmissionsProvider>
      </ProctorProvider>
    </ContestProvider>
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

function NetworkStatusBanner() {
  const isOnline = React.useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );
  const isOffline = !isOnline;
  const [showRestored, setShowRestored] = useState(false);
  const wasOfflineRef = React.useRef(false);

  useEffect(() => {
    if (wasOfflineRef.current && isOnline) {
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 4000);
      return () => clearTimeout(timer);
    }
    wasOfflineRef.current = !isOnline;
  }, [isOnline]);

  if (isOffline) {
    return (
      <div
        role="alert"
        className="z-50 flex items-center justify-between gap-3 border-b-2 border-destructive bg-destructive/20 px-4 py-2 text-xs text-destructive animate-in slide-in-from-top-1 shrink-0"
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="font-semibold">Network Connection Lost.</span>
          <span className="text-muted-foreground hidden sm:inline">
            Reconnecting to the contest server...
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isDesktopClient()) {
              void fetch("http://127.0.0.1:47620/offline", { method: "POST", mode: "no-cors" });
            } else {
              window.location.reload();
            }
          }}
          className="pixel-flat bg-destructive text-white px-2.5 py-1 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div
        role="status"
        className="z-50 flex items-center gap-2 border-b-2 border-success bg-success/20 px-4 py-1.5 text-xs text-success animate-in slide-in-from-top-1 shrink-0"
      >
        <Wifi className="h-4 w-4 shrink-0" />
        <span className="font-semibold">Connection Restored.</span>
      </div>
    );
  }

  return null;
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
