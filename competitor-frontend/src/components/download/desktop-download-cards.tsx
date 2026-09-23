"use client";

import { useSyncExternalStore } from "react";
import { Download, Laptop, MonitorDown, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DESKTOP_BUILDS,
  detectOs,
  type DesktopBuildOs,
} from "@/lib/desktop-builds";

const OS_ICONS: Record<DesktopBuildOs, typeof Laptop> = {
  windows: MonitorDown,
  macos: Laptop,
  linux: Terminal,
};

export function DesktopDownloadCards() {
  const recommended = useSyncExternalStore(
    () => () => {},
    detectOs,
    () => null,
  );

  return (
    <div className="flex flex-col gap-4">
      {DESKTOP_BUILDS.map((build) => {
        const Icon = OS_ICONS[build.os];
        const isRecommended = recommended === build.os;
        return (
          <div
            key={build.os}
            className={cn(
              "pixel-raised bg-card p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 border",
              isRecommended ? "border-primary/50" : "border-border",
            )}
          >
            <div className="flex items-center gap-3 md:w-44 shrink-0">
              <Icon className="size-6 text-foreground shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-foreground">
                    {build.label}
                  </span>
                  {isRecommended && (
                    <Badge
                      variant="outline"
                      className="text-[11px] uppercase tracking-wide border-primary/40 text-primary"
                    >
                      Your OS
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {build.file} · {build.sizeLabel}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="font-bold text-foreground">Install: </span>
                {build.installNote}
              </p>
              <p className="text-xs text-amber-500/90 leading-relaxed">
                <span className="font-bold">Heads up: </span>
                {build.gateNote}
              </p>
            </div>

            <div className="flex flex-col gap-2 md:w-56 shrink-0">
              <a
                href={`/desktop-client/${build.file}`}
                download
                className={cn(buttonVariants({ variant: "default", size: "default" }), "w-full")}
              >
                <Download className="size-4" />
                Download
              </a>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground py-1">
                  SHA-256 checksum
                </summary>
                <code className="mt-1 block break-all font-mono text-[10px] leading-relaxed">
                  {build.sha256}
                </code>
              </details>
            </div>
          </div>
        );
      })}
    </div>
  );
}
