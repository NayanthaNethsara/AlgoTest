"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ContestSettingsInput, ContestState } from "@/types/contest";

export type ContestSettingsForm = {
  title: string;
  durationMinutes: string;
  requireFullscreen: boolean;
  minClientVersion: string;
  enforceBinaryHash: boolean;
  authorizedBinaryHashes: string;
};

function formOf(state: ContestState | null): ContestSettingsForm {
  return {
    title: state?.title ?? "",
    durationMinutes: state ? String(Math.floor(state.durationSeconds / 60)) : "120",
    requireFullscreen: Boolean(state?.requireFullscreen),
    minClientVersion: state?.minClientVersion || "0.2.0",
    enforceBinaryHash: Boolean(state?.enforceBinaryHash),
    authorizedBinaryHashes: state?.authorizedBinaryHashes || "",
  };
}

/**
 * Seeded from live state only when it opens, so the background poll that
 * refreshes the control bar every few seconds cannot overwrite what is being
 * typed here.
 */
export function ContestSettingsDialog({
  open,
  onOpenChange,
  state,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ContestState | null;
  pending: boolean;
  onSave: (input: ContestSettingsInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ContestSettingsForm>(() => formOf(state));

  useEffect(() => {
    if (open) setForm(formOf(state));
    // Re-seeding on every `state` tick is exactly what this dialog must not do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function update<K extends keyof ContestSettingsForm>(key: K, value: ContestSettingsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const duration = Number.parseInt(form.durationMinutes, 10);
  const durationInvalid = Number.isNaN(duration) || duration < 1 || duration > 525600;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (durationInvalid) return;
    await onSave({
      title: form.title.trim(),
      durationMinutes: duration,
      freezeMinutes: state?.freezeMinutes ?? 30,
      requireFullscreen: form.requireFullscreen,
      minClientVersion: form.minClientVersion.trim(),
      enforceBinaryHash: form.enforceBinaryHash,
      authorizedBinaryHashes: form.authorizedBinaryHashes.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contest settings</DialogTitle>
          <DialogDescription>
            Applies to every competitor client the next time it checks in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="contest-title">Contest title</FieldLabel>
              <Input
                id="contest-title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="MiniAlgothon 2026 Finals"
                className="text-xs"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="contest-duration">Duration (minutes)</FieldLabel>
              <Input
                id="contest-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={525600}
                value={form.durationMinutes}
                onChange={(e) => update("durationMinutes", e.target.value)}
                aria-invalid={durationInvalid}
                className="font-mono text-xs"
              />
              {durationInvalid && (
                <FieldDescription className="text-destructive">
                  Enter a duration between 1 and 525,600 minutes (up to 1 year).
                </FieldDescription>
              )}
            </Field>

            <FieldSeparator />

            <Field orientation="horizontal">
              <FieldLabel htmlFor="require-fullscreen" className="flex-col items-start gap-0.5">
                <FieldTitle>Require browser fullscreen</FieldTitle>
                <FieldDescription>
                  Locks the competitor web portal into fullscreen mode.
                </FieldDescription>
              </FieldLabel>
              <Switch
                id="require-fullscreen"
                checked={form.requireFullscreen}
                onCheckedChange={(checked) => update("requireFullscreen", checked)}
              />
            </Field>

            <FieldSeparator />

            <Field>
              <FieldLabel htmlFor="min-client-version">Minimum client version</FieldLabel>
              <Input
                id="min-client-version"
                value={form.minClientVersion}
                onChange={(e) => update("minClientVersion", e.target.value)}
                placeholder="0.2.0"
                className="font-mono text-xs"
              />
              <FieldDescription>Older clients are blocked from enrolling.</FieldDescription>
            </Field>

            <FieldSeparator />

            <Field orientation="horizontal">
              <FieldLabel htmlFor="enforce-hash" className="flex-col items-start gap-0.5">
                <FieldTitle>Enforce binary release hash</FieldTitle>
                <FieldDescription>
                  Verifies the client executable SHA-256 against authorized checksums.
                </FieldDescription>
              </FieldLabel>
              <Switch
                id="enforce-hash"
                checked={form.enforceBinaryHash}
                onCheckedChange={(checked) => update("enforceBinaryHash", checked)}
              />
            </Field>

            {form.enforceBinaryHash && (
              <Field>
                <FieldLabel htmlFor="authorized-hashes">
                  Authorized release hashes (SHA-256)
                </FieldLabel>
                <Textarea
                  id="authorized-hashes"
                  value={form.authorizedBinaryHashes}
                  onChange={(e) => update("authorizedBinaryHashes", e.target.value)}
                  placeholder="Comma-separated SHA-256 hex digests…"
                  rows={3}
                  spellCheck={false}
                  className="resize-none font-mono text-xs"
                />
                <FieldDescription>Generated automatically during release builds.</FieldDescription>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || durationInvalid}
              className="gap-1.5"
            >
              {pending && <Spinner />} Save settings
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
