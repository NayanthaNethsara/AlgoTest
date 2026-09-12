"use client";

import { useEffect, useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type AccessReasonRequest = {
  title: string;
  /** What granting this actually costs, shown before the organizer commits. */
  consequence: string;
  subject: string;
  defaultReason: string;
  confirmLabel: string;
};

/**
 * Every proctoring override is auditable, so the reason is captured in a real
 * dialog rather than a browser prompt (which some browsers suppress outright).
 */
export function AccessReasonDialog({
  request,
  pending,
  onConfirm,
  onCancel,
}: {
  request: AccessReasonRequest | null;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason(request?.defaultReason ?? "");
  }, [request]);

  const trimmed = reason.trim();

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4 text-warning" />
            {request?.title}
          </DialogTitle>
          <DialogDescription>{request?.subject}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
            {request?.consequence}
          </p>

          <Field>
            <FieldLabel htmlFor="access-reason">Reason</FieldLabel>
            <Textarea
              id="access-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Why is this override needed?"
              className="text-xs"
            />
            <FieldDescription>
              Recorded against your account and every submission made under this override.
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!trimmed || pending}
            onClick={() => onConfirm(trimmed)}
            className="gap-1.5"
          >
            {pending && <Spinner />}
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
