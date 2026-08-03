"use client";

import { useEffect } from "react";
import { getSessionTokenAction } from "@/actions/auth-session";
import { pingWebTelemetryAction } from "@/actions/telemetry";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __TAURI__?: {
      core?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
  }
}

export function TelemetryBridge() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === "false") {
      return;
    }

    let pingTimer: NodeJS.Timeout | null = null;

    async function initializeTelemetryBridge() {
      const sessionToken = await getSessionTokenAction();
      if (!sessionToken) {
        return;
      }

      const invokeFn =
        window.__TAURI_INTERNALS__?.invoke ||
        window.__TAURI__?.core?.invoke;

      const isDesktopEnvironment = typeof invokeFn === "function";

      if (isDesktopEnvironment) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
          await invokeFn("update_telemetry_auth", {
            token: sessionToken,
            apiUrl: apiUrl,
          });
        } catch (err) {
          console.warn("Failed to sync telemetry auth with Tauri:", err);
        }
      } else {
        const sendWebPing = async () => {
          const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "Web Browser";
          const isTabActive = typeof document !== "undefined" ? !document.hidden : true;
          const activeWindowStatus = isTabActive
            ? "Web Portal (Active Tab)"
            : "Web Portal (Background Tab / Unfocused)";

          await pingWebTelemetryAction({
            active_window: activeWindowStatus,
            running_processes: [],
            os_info: userAgent,
            client_type: "WEB",
          });
        };

        sendWebPing();
        pingTimer = setInterval(sendWebPing, 15_000);
      }
    }

    initializeTelemetryBridge();

    return () => {
      if (pingTimer) {
        clearInterval(pingTimer);
      }
    };
  }, []);

  return null;
}
