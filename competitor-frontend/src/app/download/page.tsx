import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldOff } from "lucide-react";
import { getContestStateAction } from "@/actions/contest";
import { DesktopDownloadCards } from "@/components/download/desktop-download-cards";

export const metadata = {
  title: "Download Desktop Proctor — Algothon",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DownloadPage() {
  const { downloadEnabled } = await getContestStateAction();

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
          src="/logo/algothon.svg"
          alt="Algothon"
          className="h-5 w-auto object-contain"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
          <div>
            <h1 className="text-lg font-pixel-header text-primary tracking-wide mb-2">
              Download Desktop Proctor
            </h1>
            <p className="text-sm text-muted-foreground">
              Required to submit during the contest. Pick your OS below and
              leave it running for the full duration — see{" "}
              <Link
                href="/rules"
                className="text-primary underline underline-offset-2"
              >
                Contest Rules
              </Link>{" "}
              for details on what it does.
            </p>
          </div>

          {downloadEnabled ? (
            <>
              <DesktopDownloadCards />

              <div className="pixel-flat bg-amber-500/5 border border-amber-500/30 p-4 flex items-start gap-3">
                <ShieldAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  These builds aren&apos;t code-signed yet, so your OS or
                  antivirus may show an unrecognized-publisher warning on
                  first launch — that&apos;s expected, not a sign of
                  tampering. Only download from this page over HTTPS, and
                  match the SHA-256 checksum shown under each build if you
                  want to verify the file wasn&apos;t corrupted or modified in
                  transit.
                </p>
              </div>
            </>
          ) : (
            <div className="pixel-raised bg-card p-5 flex items-start gap-3 border border-border">
              <ShieldOff className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Downloads are turned off right now. Check with an organizer,
                or check back closer to the contest.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
