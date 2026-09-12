"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatByteSize } from "@/lib/testcase-utils";
import type { InspectModalState } from "./types";

interface TestContentInspectorDialogProps {
  state: InspectModalState;
  onClose: () => void;
  onCopy: () => void;
}

export function TestContentInspectorDialog({
  state,
  onClose,
  onCopy,
}: TestContentInspectorDialogProps) {
  const byteSize = new Blob([state.content]).size;

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center justify-between pr-6">
            <span>{state.title}</span>
            {!state.loading && !state.error && (
              <span className="text-xs font-mono text-muted-foreground font-normal">
                {formatByteSize(byteSize)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 py-2">
          {state.loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading content from database...
            </div>
          ) : state.error ? (
            <div className="p-4 rounded bg-destructive/10 text-destructive text-xs">
              {state.error}
            </div>
          ) : (
            <Textarea
              readOnly
              value={state.content}
              className="font-mono text-xs leading-relaxed h-[55vh] resize-none overflow-y-auto w-full select-all"
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {!state.loading && !state.error && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(state.content);
                onCopy();
              }}
            >
              Copy All Text
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
