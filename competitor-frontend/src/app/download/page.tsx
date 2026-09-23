import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCT_NAME } from "@labyrithm/branding";
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { getContestStateAction } from "@/actions/contest";
import { Badge } from "@/components/ui/badge";
import { DesktopDownloadCards } from "@/components/download/desktop-download-cards";

export const metadata = {
  title: `Download Desktop Proctor — ${PRODUCT_NAME}`,
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DownloadPage() {
  const { downloadEnabled } = await getContestStateAction();

  if (!downloadEnabled) {
    notFound();
  }

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
          alt={PRODUCT_NAME}
          className="h-5 w-auto object-contain"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 py-10 sm:py-14 space-y-8 font-mono">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-pixel-header text-primary tracking-wide">
                Download Desktop Proctor
              </h1>
              <Badge
                variant="outline"
                className="text-[11px] uppercase tracking-wide border-amber-500/40 text-amber-500"
              >
                Beta
              </Badge>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Required to submit during the contest. Pick your OS below and
              leave it running for the full duration.
            </p>
          </div>

          <div className="pixel-raised bg-card p-5 sm:p-6 border border-border space-y-4">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Before You Install
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-500">
                  What it does
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    Confirms your machine is present for the full contest —
                    closing it locks scored submissions until it reconnects.
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    Checks in with the contest server in the background at a
                    short interval.
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    Watches for a specific, published list of proctoring signals
                    and sends anything flagged to a human for review.
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-red-500">
                  What it doesn&apos;t do
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                  <li className="flex items-start gap-2">
                    <XCircle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                    Doesn&apos;t collect anything beyond that published list —
                    see{" "}
                    <Link
                      href="/privacy"
                      className="text-primary underline underline-offset-2"
                    >
                      Privacy &amp; Support
                    </Link>{" "}
                    for the exact, live disclosure.
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                    Doesn&apos;t auto-flag or disqualify you — nothing happens
                    without a human reviewing it first.
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                    Doesn&apos;t need to stay installed afterward — quit it once
                    the contest and submissions are closed.
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed pt-3 border-t border-border/60">
              <strong className="text-foreground">
                Beta software, independent project.
              </strong>{" "}
              {PRODUCT_NAME} is an independent student project — free and
              open-source, provided as-is with no guaranteed uptime or support.
              It isn&apos;t an official platform of, endorsed by, or affiliated
              with GTN or SLIIT, and neither is responsible for it. This client
              is still in beta and isn&apos;t code-signed — install and run it
              at your own risk. We don&apos;t accept liability for lost
              submissions, downtime, or other issues that come from using it
              during the contest. See{" "}
              <Link
                href="/rules"
                className="text-primary underline underline-offset-2"
              >
                Contest Rules
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-primary underline underline-offset-2"
              >
                Privacy &amp; Support
              </Link>{" "}
              for the full details.
            </p>
          </div>

          <DesktopDownloadCards />

          <div className="pixel-flat bg-amber-500/5 border border-amber-500/30 p-5 flex items-start gap-4">
            <ShieldAlert className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              These builds aren&apos;t code-signed yet, so your OS or antivirus
              may show an unrecognized-publisher warning on first launch —
              that&apos;s expected, not a sign of tampering. Only download from
              this page over HTTPS, and match the SHA-256 checksum shown under
              each build if you want to verify the file wasn&apos;t corrupted or
              modified in transit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
