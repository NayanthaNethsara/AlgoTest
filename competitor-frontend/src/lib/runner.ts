import { backendFetch } from "@/lib/api/server";
import type { RunResult } from "@/types/code";

export async function executeRun(
  language: string,
  code: string,
  stdin: string,
): Promise<RunResult> {
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
        stderr:
          body.error ??
          "You already have an active code run in progress. Please wait for it to complete.",
        exitCode: 409,
        timeMs: 0,
        verdict: "IE",
      };
    }
    if (res.status === 423 || body.code === "GATE_UNAVAILABLE") {
      return {
        stdout: "",
        stderr:
          body.error ??
          "Running code needs the proctor client. Start it, then try again.",
        exitCode: res.status,
        timeMs: 0,
        verdict: "IE",
      };
    }
    if (res.status === 503) {
      return {
        stdout: "",
        stderr:
          "Server busy: capacity limit reached. Please retry in a few seconds.",
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
