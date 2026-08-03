import { CONFIG } from "@/lib/config";
import { backendFetch } from "@/lib/api/server";
import type { RunResult } from "@/types/code";

/**
 * Execute custom user code against custom stdin.
 * Dispatches to local desktop runner if PLATFORM=desktop, or central server runner if PLATFORM=web.
 */
export async function executeRun(
  language: string,
  code: string,
  stdin: string,
): Promise<RunResult> {
  const isDesktop = CONFIG.PLATFORM === "desktop";

  // 1. Desktop Mode: Call local embedded sidecar runner with packed compilers
  if (isDesktop) {
    try {
      const res = await fetch(`${CONFIG.LOCAL_RUNNER_URL}/api/v1/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code, stdin }),
      });

      if (res.ok) {
        return await res.json();
      }
    } catch {
      return {
        stdout: "",
        stderr: "Local desktop code runner service unavailable. Please verify local compiler tools installation.",
        exitCode: 1,
        timeMs: 0,
        verdict: "IE",
      };
    }
  }

  // 2. Web Mode: Call central contest backend runner
  const res = await backendFetch("/api/v1/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code, stdin }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      return {
        stdout: "",
        stderr: body.error ?? "You already have an active code run in progress. Please wait for it to complete.",
        exitCode: 409,
        timeMs: 0,
        verdict: "IE",
      };
    }
    if (res.status === 503) {
      return {
        stdout: "",
        stderr: "Server busy: capacity limit reached. Please retry in a few seconds.",
        exitCode: 503,
        timeMs: 0,
        verdict: "IE",
      };
    }
    return {
      stdout: "",
      stderr: body.error ?? "run failed",
      exitCode: 1,
      timeMs: 0,
      verdict: "IE",
    };
  }

  return res.json();
}
