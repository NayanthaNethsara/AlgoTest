"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CpuIcon,
  HardDriveIcon,
  HelpCircleIcon,
  TerminalIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function TestCaseLimitsGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-muted/20 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <HelpCircleIcon className="size-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground">
            System Limits &amp; Recommendations Guide
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            20 MiB input
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            16 MiB output
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            200+ MB suite support
          </Badge>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <>
              <ChevronUpIcon className="size-3" /> Hide guide
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3" /> View limitations &amp; recommendations
            </>
          )}
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t px-3 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-muted-foreground">
          <div className="rounded border bg-background/50 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <HardDriveIcon className="size-3.5 text-primary" />
              <span>File Size &amp; Batch Uploads</span>
            </div>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                Maximum <strong className="text-foreground">20 MiB</strong> per{" "}
                <code className="font-mono text-[10px]">.in</code> file and{" "}
                <strong className="text-foreground">16 MiB</strong> per{" "}
                <code className="font-mono text-[10px]">.out</code> file.
              </li>
              <li>
                Batch uploads stream sequentially part-by-part. Entire test suites totaling{" "}
                <strong className="text-foreground">200+ MB</strong> (e.g. 15 cases at 10–15 MB each)
                upload without exceeding the 64 MiB HTTP request ceiling.
              </li>
              <li>
                Test suites load when first judged and are cached within the worker memory budget.
              </li>
            </ul>
          </div>

          <div className="rounded border bg-background/50 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <TerminalIcon className="size-3.5 text-primary" />
              <span>Program Output Limit</span>
            </div>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                Sandbox isolates enforce a hard{" "}
                <strong className="text-foreground">16 MiB</strong> file size cap on contestant standard output.
              </li>
              <li>
                Programs exceeding 16 MiB of output receive Output Limit Exceeded (OLE).
              </li>
              <li>
                Expected output files (<code className="font-mono text-[10px]">.out</code>) must not exceed 16 MiB.
              </li>
            </ul>
          </div>

          <div className="rounded border bg-background/50 p-2.5 space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <CpuIcon className="size-3.5 text-primary" />
              <span>Recommended Problem Settings for Heavy Inputs (10–15 MB)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground pt-0.5">
              <div>
                <span className="font-semibold text-foreground block">Time Limit &ge; 2500 ms</span>
                Reading 10–15 MB of standard input in interpreted environments (Python, Node.js) requires
                100–300 ms just for I/O parsing.
              </div>
              <div>
                <span className="font-semibold text-foreground block">Memory Limit &ge; 256 MB</span>
                Loading multi-megabyte string buffers and parsed structures requires additional memory to
                prevent Out Of Memory (OOM) termination.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
