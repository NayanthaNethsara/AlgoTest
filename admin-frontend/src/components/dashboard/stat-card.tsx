"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "success" | "warning" | "destructive";

const TONE_VALUE: Record<StatTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TONE_CARD: Record<StatTone, string> = {
  neutral: "",
  success: "",
  warning: "ring-warning/30",
  destructive: "ring-destructive/30",
};

/**
 * A single headline number. Only the counts an organizer must act on carry
 * colour — if every tile is coloured, none of them mean anything.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <Card
      size="sm"
      className={cn(
        "h-full transition-colors",
        TONE_CARD[tone],
        href && "hover:bg-muted/30 hover:ring-foreground/20"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
        {icon && <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>}
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className={cn("font-mono text-2xl leading-none font-bold", TONE_VALUE[tone])}>
              {value}
            </div>
          )}
          {hint && !loading && (
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</p>
          )}
        </div>
        {href && !loading && (
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </CardContent>
    </Card>
  );

  if (!href) return body;

  return (
    <Link
      href={href}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`${label}: open`}
    >
      {body}
    </Link>
  );
}
