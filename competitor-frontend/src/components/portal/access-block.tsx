"use client";

import { Loader2, RotateCw, ShieldOff } from "lucide-react";
import { contestLocked, useProctor } from "@/components/providers/proctor-provider";
import { Button } from "@/components/ui/button";
import type { AccessMode } from "@/types/proctor";

/**
 * What each mode is, in the contestant's words.
 */
const MODE_LABEL: Record<AccessMode, string> = {
  DESKTOP: "the proctor client window",
  WEB_WITH_AGENT: "a browser, with the proctor client running",
  WEB_ONLY: "a browser, with no proctor client running",
};

const LOCK_TITLE: Record<string, string> = {
  CLIENT_NOT_ALLOWED: "Browser Access Not Permitted",
  AGENT_MISSING: "Proctor Client Required",
  AGENT_STOPPED: "Proctor Client Stopped",
  ENROLLMENT_REVOKED: "Enrollment Revoked",
  AGENT_UNREACHABLE: "Proctor Client Unreachable",
  AGENT_STALE: "Proctor Connection Stale",
  AGENT_STARTING: "Proctor Client Starting",
};

/**
 * The one lock that clears itself. It is still a lock — the API withholds the
 * contest during startup exactly as it does for a stopped client — but dressing a
 * three-second wait in the same alarm as a revoked enrolment trains contestants to
 * ignore the alarm.
 */
const TRANSIENT = "AGENT_STARTING";

/**
 * Full-screen blocking page for all proctor lock conditions.
 *
 * When a contestant cannot proceed due to agent or permission requirements,
 * this page blocks access to the editor and problem workspace entirely.
 * There is no option to dismiss or bypass to the editor.
 */
export function AccessBlockScreen() {
  const state = useProctor();
  const { code, accessMode, allowedModes, remedy, local } = state;

  if (!contestLocked(state)) return null;

  const transient = code === TRANSIENT;
  const title = (code && LOCK_TITLE[code]) || "Contest Access Blocked";

  return (
    <div
      role="alertdialog"
      aria-labelledby="access-block-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-background p-6"
    >
      <div className="pixel-raised flex w-full max-w-xl flex-col gap-5 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 border-b-2 border-border pb-4">
          {transient ? (
            <Loader2 className="size-7 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ShieldOff className="size-7 shrink-0 text-destructive" />
          )}
          <div>
            <h2 id="access-block-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contest workspace &amp; editor locked
            </p>
          </div>
        </div>

        <dl className="flex flex-col gap-2.5 pixel-flat bg-muted/40 p-4 text-xs">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Current environment:</dt>
            <dd className="font-semibold text-foreground">
              {accessMode ? MODE_LABEL[accessMode] : "Unrecognised window"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Allowed submission modes:</dt>
            <dd className="font-semibold text-foreground">
              {allowedModes.length > 0
                ? allowedModes.map((mode) => MODE_LABEL[mode]).join(", or ")
                : MODE_LABEL.DESKTOP}
            </dd>
          </div>
          {code && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Lock code:</dt>
              <dd
                className={`font-mono font-semibold ${transient ? "text-muted-foreground" : "text-destructive"}`}
              >
                {code}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-foreground">Required action:</span>
          <p className="text-muted-foreground leading-relaxed">
            {remedy ??
              "Start the proctor client window, or ask an organizer to grant browser access for your account."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
          <Button type="button" onClick={() => window.location.reload()}>
            <RotateCw className="size-4" />
            Retry connection
          </Button>
          {local?.support_code && (
            <span className="font-mono text-xs text-muted-foreground">
              Support code: <span className="font-semibold text-foreground">{local.support_code}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
