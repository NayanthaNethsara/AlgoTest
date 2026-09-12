"use client";

import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: "ok" | "warn" | "blocked";
  href?: string;
  action?: string;
};

const ICONS = {
  ok: CheckCircle2Icon,
  warn: CircleDashedIcon,
  blocked: AlertTriangleIcon,
};

const TONES = {
  ok: "text-success",
  warn: "text-warning",
  blocked: "text-destructive",
};

/**
 * The pre-contest answer to "can we actually start?". Ordered worst-first so the
 * thing blocking the contest is always the first row.
 */
export function ReadinessChecklist({ checks }: { checks: ReadinessCheck[] }) {
  const order = { blocked: 0, warn: 1, ok: 2 };
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  const blocking = checks.filter((c) => c.status === "blocked").length;

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="text-sm">Contest readiness</CardTitle>
        <p className="text-xs text-muted-foreground">
          {blocking === 0
            ? "Nothing is blocking the start."
            : `${blocking} item(s) must be resolved before starting.`}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {sorted.map((check) => {
            const Icon = ICONS[check.status];
            return (
              <li key={check.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[check.status])} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{check.label}</p>
                  <p className="text-[11px] text-muted-foreground">{check.detail}</p>
                </div>
                {check.href && check.status !== "ok" && (
                  <Link
                    href={check.href}
                    className={buttonVariants({
                      variant: "outline",
                      size: "xs",
                      className: "shrink-0",
                    })}
                  >
                    {check.action ?? "Fix"}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
