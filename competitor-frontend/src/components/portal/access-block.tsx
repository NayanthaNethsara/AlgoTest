"use client";

import { RotateCw, ShieldOff } from "lucide-react";
import { useProctor } from "@/components/providers/proctor-provider";
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
};

/**
 * Full-screen blocking page for all proctor lock conditions.
 *
 * When a contestant cannot proceed due to agent or permission requirements,
 * this page blocks access to the editor and problem workspace entirely.
 * There is no option to dismiss or bypass to the editor.
 */
export function AccessBlockScreen() {
  const {
    resolved,
    submissionsAllowed,
    exempt,
    starting,
    code,
    accessMode,
    allowedModes,
    remedy,
    local,
  } = useProctor();

  const blocked =
    resolved && !submissionsAllowed && !exempt && !starting;

  if (!blocked) return null;

  const title = (code && LOCK_TITLE[code]) || "Contest Access Blocked";

  return (
    <div
      role="alertdialog"
      aria-labelledby="access-block-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-background p-6"
    >
      <div className="pixel-raised flex w-full max-w-xl flex-col gap-5 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 border-b-2 border-border pb-4">
          <ShieldOff className="size-7 shrink-0 text-destructive" />
          <div>
            <h2
              id="access-block-title"
              className="font-pixel-header text-base uppercase tracking-wider text-foreground"
            >
              {title}
            </h2>
            <p className="text-xs font-pixel-body text-muted-foreground mt-0.5">
              Contest workspace & editor locked
            </p>
          </div>
        </div>

        <dl className="flex flex-col gap-2.5 border-2 border-black bg-muted/40 p-4 text-xs font-pixel-body">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Current Environment:</dt>
            <dd className="font-bold text-foreground">
              {accessMode ? MODE_LABEL[accessMode] : "Unrecognised window"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Allowed Submission Modes:</dt>
            <dd className="font-bold text-foreground">
              {allowedModes.length > 0
                ? allowedModes.map((mode) => MODE_LABEL[mode]).join(", or ")
                : MODE_LABEL.DESKTOP}
            </dd>
          </div>
          {code && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Lock Code:</dt>
              <dd className="font-mono text-destructive font-bold">{code}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-1 text-xs font-pixel-body">
          <span className="font-bold text-foreground">Required Action:</span>
          <p className="text-muted-foreground leading-relaxed">
            {remedy ??
              "Start the proctor client window, or ask an organizer to grant browser access for your account."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 border-2 border-black bg-primary px-4 py-2 font-pixel-body text-xs font-bold uppercase text-primary-foreground transition-all hover:bg-primary/90 active:translate-y-0.5"
          >
            <RotateCw className="size-4" />
            Retry Connection
          </button>
          {local?.support_code && (
            <span className="font-mono text-xs text-muted-foreground">
              SUPPORT CODE: <span className="font-bold text-foreground">{local.support_code}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
