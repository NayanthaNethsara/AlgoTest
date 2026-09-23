import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-dvh flex flex-col bg-background select-none">
      <div className="flex items-center justify-between border-b-2 border-black bg-card px-4 sm:px-6 py-3 shrink-0">
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Login
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/labyrithm.svg"
          alt="Labyrithm"
          className="h-5 w-auto object-contain"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 py-10 sm:py-14 font-mono">
          <h1 className="text-2xl sm:text-3xl font-pixel-header text-primary tracking-wide mb-3">
            {title}
          </h1>
          {description && (
            <p className="text-sm sm:text-base text-muted-foreground mb-8 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="pixel-raised bg-card/60 border border-border p-5 sm:p-6 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
        {title}
      </h2>
      <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
