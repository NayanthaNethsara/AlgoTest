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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
      {DESKTOP_BUILDS.map((build) => {
        const Icon = OS_ICONS[build.os];
        const isRecommended = recommended === build.os;
        return (
          <div
            key={build.os}
            className={cn(
              "pixel-raised bg-card p-4 flex flex-col gap-3 border",
              isRecommended ? "border-primary/50" : "border-border",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-foreground" />
                <span className="text-sm font-bold text-foreground">
                  {build.label}
                </span>
              </div>
              {isRecommended && (
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-wide border-primary/40 text-primary"
                >
                  Your OS
                </Badge>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {build.installNote}
            </p>

            <a
              href={`/desktop-client/${build.file}`}
              download
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-full")}
            >
              <Download className="size-3.5" />
              {build.file} ({build.sizeLabel})
            </a>

            <p className="text-[10px] text-amber-500/90 leading-relaxed">
              {build.gateNote}
            </p>

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                SHA-256 checksum
              </summary>
              <code className="mt-1 block break-all font-mono text-[9px] leading-relaxed">
                {build.sha256}
              </code>
            </details>
          </div>
        );
      })}
    </div>
  );
}
