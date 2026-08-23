"use client";

import { Loader2, RotateCw, ShieldOff } from "lucide-react";
import { contestLocked, useProctor } from "@/components/portal/proctor-provider";
import { Button } from "@/components/ui/button";
import {
  PROCTOR_LOCK_TITLES,
  PROCTOR_MODE_LABELS,
  PROCTOR_TRANSIENT_CODE,
} from "@/lib/constants";

export function AccessBlockScreen() {
  const state = useProctor();
  const { code, accessMode, allowedModes, remedy, local } = state;

  if (!contestLocked(state)) return null;

  const transient = code === PROCTOR_TRANSIENT_CODE;
  const title = (code && PROCTOR_LOCK_TITLES[code]) || "Contest Access Blocked";

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
              {accessMode ? PROCTOR_MODE_LABELS[accessMode] : "Unrecognised window"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Allowed submission modes:</dt>
            <dd className="font-semibold text-foreground">
              {allowedModes.length > 0
                ? allowedModes.map((mode) => PROCTOR_MODE_LABELS[mode]).join(", or ")
                : PROCTOR_MODE_LABELS.DESKTOP}
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
