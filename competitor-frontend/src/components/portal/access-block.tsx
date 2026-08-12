"use client";

import { useState } from "react";
import { RotateCw, ShieldOff } from "lucide-react";
import { useProctor } from "@/components/providers/proctor-provider";
import type { AccessMode } from "@/types/proctor";

/**
 * What each mode is, in the contestant's words. They know "I have the app open" or
 * "I'm in Chrome" — not `WEB_WITH_AGENT`.
 */
const MODE_LABEL: Record<AccessMode, string> = {
  DESKTOP: "the proctor client window",
  WEB_WITH_AGENT: "a browser, with the proctor client running",
  WEB_ONLY: "a browser, with no proctor client running",
};

/**
 * Full-screen notice for the one lock a contestant cannot clear themselves: the
 * window they are working in is not one this account may make scored submissions
 * from.
 *
 * Deliberately not shown for the other lock codes. A stale or restarting agent
 * clears on its own within seconds and the top banner is the right weight for it;
 * taking the whole screen away mid-keystroke over a 15-second blip would be worse
 * than the problem. This one never clears on its own — it needs an organizer — so a
 * contestant must not be able to code for an hour without noticing.
 *
 * It can be dismissed to reach the editor, because test runs still work in every
 * mode and stranding someone in front of a wall helps nobody. The banner stays up
 * after dismissal, so the state is never invisible.
 */
export function AccessBlockScreen() {
  const { resolved, submissionsAllowed, exempt, code, accessMode, allowedModes, remedy, local } =
    useProctor();
  const [dismissed, setDismissed] = useState(false);

  const blocked =
    resolved && !submissionsAllowed && !exempt && code === "CLIENT_NOT_ALLOWED";

  if (!blocked || dismissed) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="access-block-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 p-6"
    >
      <div className="pixel-raised flex w-full max-w-xl flex-col gap-4 bg-card p-6">
        <div className="flex items-center gap-3">
          <ShieldOff className="size-6 shrink-0 text-destructive" />
          <h2
            id="access-block-title"
            className="font-pixel-header text-sm uppercase tracking-wider text-foreground"
          >
            Scored submissions locked
          </h2>
        </div>

        <dl className="flex flex-col gap-2 border-2 border-black bg-muted/40 p-3 text-xs font-pixel-body">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">You are working in:</dt>
            <dd className="font-bold text-foreground">
              {accessMode ? MODE_LABEL[accessMode] : "an unrecognised window"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Your account may submit from:</dt>
            <dd className="font-bold text-foreground">
              {allowedModes.length > 0
                ? allowedModes.map((mode) => MODE_LABEL[mode]).join(", or ")
                : MODE_LABEL.DESKTOP}
            </dd>
          </div>
        </dl>

        <p className="text-xs font-pixel-body text-foreground">
          {remedy ??
            "Open the contest in the proctor client window, or ask an organizer to allow browser access for your account."}
        </p>

        <p className="text-[11px] font-pixel-body text-muted-foreground">
          Test runs still work here — only scored submissions are held. Nothing you
          have written is lost.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 border-2 border-black bg-primary px-3 py-1.5 font-pixel-body text-xs font-bold uppercase text-primary-foreground transition-all hover:bg-primary/90 active:translate-y-0.5"
          >
            <RotateCw className="size-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="font-pixel-body text-xs text-muted-foreground underline hover:text-foreground"
          >
            Continue to the editor (test runs only)
          </button>
          {local?.support_code && (
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              CODE: <span className="font-bold">{local.support_code}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
