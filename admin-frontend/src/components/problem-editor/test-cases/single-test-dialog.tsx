"use client";

import { useState, useEffect } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TestCaseMetadata } from "@/types/problem";
import { uploadSingleTestCase, updateSingleTestCase } from "@/lib/api/test-uploader";

interface SingleTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemId: string;
  editTest: TestCaseMetadata | null;
  onSuccess: (test: TestCaseMetadata, isEdit: boolean) => void;
}

export function SingleTestDialog({
  open,
  onOpenChange,
  problemId,
  editTest,
  onSuccess,
}: SingleTestDialogProps) {
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState("");
  const [expFile, setExpFile] = useState<File | null>(null);
  const [expText, setExpText] = useState("");
  const [points, setPoints] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editTest) {
        setInputFile(null);
        setInputText("");
        setExpFile(null);
        setExpText("");
        setPoints(editTest.points);
        setUploadProgress(0);
        setError(null);
      } else {
        setInputFile(null);
        setInputText("");
        setExpFile(null);
        setExpText("");
        setPoints(0);
        setUploadProgress(0);
        setError(null);
      }
    }
  }, [open, editTest]);

  async function handleSave() {
    setError(null);

    const hasInput = inputFile || inputText.trim();
    const hasExpected = expFile || expText.trim();

    if (!editTest && (!hasInput || !hasExpected)) {
      setError("Both input and expected output must be provided.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      if (editTest) {
        const inputVal = inputFile || (inputText ? inputText : undefined);
        const expVal = expFile || (expText ? expText : undefined);
        const updated = await updateSingleTestCase(
          problemId,
          editTest.ordinal,
          {
            input: inputVal,
            expected: expVal,
            points,
          },
          (pct) => setUploadProgress(pct)
        );

        onSuccess(updated, true);
      } else {
        const inputVal = inputFile || inputText;
        const expVal = expFile || expText;
        const created = await uploadSingleTestCase(
          problemId,
          {
            input: inputVal,
            inputFileName: inputFile?.name,
            expected: expVal,
            expectedFileName: expFile?.name,
            points,
          },
          (pct) => setUploadProgress(pct)
        );

        onSuccess(created, false);
      }

      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload test case.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !uploading && onOpenChange(false)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {editTest ? `Replace / Edit Test Case #${editTest.ordinal}` : "Add Single Test Case"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Input file or text */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                Standard Input (stdin) {editTest && "(Leave empty to keep existing)"}
              </label>
              <label className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1">
                <FileUp className="h-3 w-3" />
                <span>{inputFile ? inputFile.name : "Select File (up to 20MB)"}</span>
                <input
                  type="file"
                  accept=".txt,.in,.dat"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setInputFile(f);
                      setInputText("");
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {!inputFile && (
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Or paste standard input text directly here..."
                rows={4}
                className="font-mono text-xs"
              />
            )}
          </div>

          {/* Expected output file or text */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                Expected Output (stdout) {editTest && "(Leave empty to keep existing)"}
              </label>
              <label className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1">
                <FileUp className="h-3 w-3" />
                <span>{expFile ? expFile.name : "Select File (up to 20MB)"}</span>
                <input
                  type="file"
                  accept=".txt,.out,.ans,.dat"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setExpFile(f);
                      setExpText("");
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {!expFile && (
              <Textarea
                value={expText}
                onChange={(e) => setExpText(e.target.value)}
                placeholder="Or paste expected output text directly here..."
                rows={4}
                className="font-mono text-xs"
              />
            )}
          </div>

          {/* Points */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">Points:</label>
            <Input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="h-8 w-24 text-xs font-mono"
            />
            <span className="text-[11px] text-muted-foreground">
              (Set 0 to split problem points automatically)
            </span>
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading to server...
                </span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={handleSave}
            className="gap-1.5"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
              </>
            ) : editTest ? (
              "Save Replacement"
            ) : (
              "Upload Test Case"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
