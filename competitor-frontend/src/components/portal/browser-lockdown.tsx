"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Maximize2,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { recordBrowserViolationAction } from "@/actions/telemetry";
import { Button } from "@/components/ui/button";
import { useContest } from "@/components/portal/contest-provider";
import type { SessionUser } from "@/lib/auth/constants";
import { isDesktopClient } from "@/lib/desktop";

type VendorDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

type VendorHtmlElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
};

type VendorNavigator = Navigator & {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
  };
};

function checkIsFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const vendorDoc = document as VendorDocument;
  const fullscreenElement =
    vendorDoc.fullscreenElement ||
    vendorDoc.webkitFullscreenElement ||
    vendorDoc.mozFullScreenElement ||
    vendorDoc.msFullscreenElement;

  if (fullscreenElement) return true;

  if (typeof window !== "undefined" && typeof screen !== "undefined") {
    return (
      window.innerHeight >= screen.height - 4 &&
      window.innerWidth >= screen.width - 4
    );
  }

  return false;
}

function subscribeFullscreen(callback: () => void): () => void {
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  document.addEventListener("mozfullscreenchange", callback);
  document.addEventListener("MSFullscreenChange", callback);
  window.addEventListener("resize", callback);

  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
    document.removeEventListener("mozfullscreenchange", callback);
    document.removeEventListener("MSFullscreenChange", callback);
    window.removeEventListener("resize", callback);
  };
}

export function BrowserLockdownScreen({ user }: { user: SessionUser | null }) {
  const { state: contestState } = useContest();
  const requireFullscreen = Boolean(contestState?.requireFullscreen);

  const isClientReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isDesktopEnv = useSyncExternalStore(
    () => () => {},
    isDesktopClient,
    () => false,
  );

  const isFullscreenActive = useSyncExternalStore(
    subscribeFullscreen,
    checkIsFullscreen,
    () => false,
  );

  const [hasExitedFullscreen, setHasExitedFullscreen] = useState(false);
  const lastInfractionReportTimeRef = useRef<number>(0);

  const enterFullscreenMode = useCallback(async () => {
    try {
      const doc = document.documentElement as VendorHtmlElement;
      if (doc.requestFullscreen) {
        await doc.requestFullscreen();
      } else if (doc.webkitRequestFullscreen) {
        await doc.webkitRequestFullscreen();
      } else if (doc.mozRequestFullScreen) {
        await doc.mozRequestFullScreen();
      } else if (doc.msRequestFullscreen) {
        await doc.msRequestFullscreen();
      }

      const vendorNav = typeof navigator !== "undefined" ? (navigator as VendorNavigator) : null;
      if (vendorNav?.keyboard?.lock) {
        try {
          await vendorNav.keyboard.lock([
            "Escape",
            "Tab",
            "AltLeft",
            "AltRight",
            "ControlLeft",
            "ControlRight",
            "MetaLeft",
            "MetaRight",
            "F1",
            "F2",
            "F3",
            "F4",
            "F5",
            "F6",
            "F7",
            "F8",
            "F9",
            "F10",
            "F11",
            "F12",
          ]);
        } catch {}
      }

      setHasExitedFullscreen(false);
    } catch {}
  }, []);

  const reportViolationTelemetry = useCallback(
    (violationType: string, detail: string) => {
      const now = Date.now();
      if (now - lastInfractionReportTimeRef.current < 2000) {
        return;
      }
      lastInfractionReportTimeRef.current = now;

      void recordBrowserViolationAction(violationType, detail, {
        timestamp: new Date().toISOString(),
        user_id: user?.id,
        screen_width: typeof window !== "undefined" ? window.innerWidth : 0,
        screen_height: typeof window !== "undefined" ? window.innerHeight : 0,
      });
    },
    [user?.id],
  );

  useEffect(() => {
    if (isDesktopEnv || !isClientReady || !requireFullscreen) return;

    const handleFullscreenChange = () => {
      if (!checkIsFullscreen()) {
        setHasExitedFullscreen(true);
        reportViolationTelemetry(
          "web.fullscreen_exit",
          "Contestant exited required fullscreen lockdown",
        );
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    window.addEventListener("resize", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      window.removeEventListener("resize", handleFullscreenChange);
    };
  }, [isDesktopEnv, isClientReady, requireFullscreen, reportViolationTelemetry]);

  useEffect(() => {
    if (isDesktopEnv || !isClientReady || !requireFullscreen) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolationTelemetry(
          "web.tab_switch",
          "Browser tab switched to background or browser minimized",
        );
      }
    };

    const handleWindowBlur = () => {
      reportViolationTelemetry(
        "web.window_blur",
        "Window focus lost: external application or IDE focused",
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isDesktopEnv, isClientReady, requireFullscreen, reportViolationTelemetry]);

  useEffect(() => {
    if (isDesktopEnv || !isClientReady || !requireFullscreen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isF12 = event.key === "F12";
      const isInspect =
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        ["I", "i", "J", "j", "C", "c"].includes(event.key);
      const isViewSource =
        (event.ctrlKey || event.metaKey) && ["U", "u"].includes(event.key);
      const isSave =
        (event.ctrlKey || event.metaKey) && ["S", "s"].includes(event.key);

      if (isF12 || isInspect || isViewSource) {
        event.preventDefault();
        event.stopPropagation();
        reportViolationTelemetry(
          "web.devtools_attempt",
          `Developer inspection shortcut attempted: ${event.key}`,
        );
      } else if (isSave) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDesktopEnv, isClientReady, requireFullscreen, reportViolationTelemetry]);

  if (!isClientReady || isDesktopEnv || !requireFullscreen) {
    return null;
  }

  if (isFullscreenActive) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={enterFullscreenMode}
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 sm:p-6 select-none cursor-pointer"
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          void enterFullscreenMode();
        }}
        className="pixel-raised flex w-full max-w-lg flex-col gap-6 bg-card p-6 sm:p-8 shadow-2xl border-2 border-primary/60 cursor-default animate-in fade-in-50 zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-3.5 border-b-2 border-border pb-4">
          <div className="p-3 bg-primary/10 text-primary pixel-flat">
            {hasExitedFullscreen ? (
              <AlertTriangle className="size-7 text-amber-400 animate-pulse" />
            ) : (
              <Maximize2 className="size-7 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">
              {hasExitedFullscreen
                ? "Fullscreen Mode Exited"
                : "Fullscreen Lockdown Required"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Competition portal is strictly limited to Fullscreen mode
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            {hasExitedFullscreen
              ? "You have exited full screen mode. To continue viewing and solving contest challenges, you must immediately return to full screen."
              : "To ensure competition fairness and prevent external tool usage, this contest portal must remain in Full Screen mode."}
          </p>

          <ul className="flex flex-col gap-2.5 bg-muted/40 p-4 pixel-flat text-xs font-medium text-foreground">
            <li className="flex items-center gap-2">
              <Shield className="size-4 text-primary shrink-0" />
              Contest workspace is only accessible in Fullscreen.
            </li>
            <li className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-400 shrink-0" />
              Leaving fullscreen or switching windows is logged to organizers.
            </li>
          </ul>
        </div>

        <div className="border-t-2 border-border pt-4">
          <Button
            type="button"
            onClick={enterFullscreenMode}
            className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-lg"
          >
            <Maximize2 className="size-4 mr-2" />
            {hasExitedFullscreen
              ? "Resume Fullscreen Contest"
              : "Enter Fullscreen & Access Contest"}
          </Button>
        </div>
      </div>
    </div>
  );
}
