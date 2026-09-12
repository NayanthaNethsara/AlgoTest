import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy & Disclaimer - MiniAlgothon",
  description:
    "Open-source platform privacy disclosures, proctor telemetry details, and limitation of liability.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/40 px-6 py-4 sm:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="font-bold text-foreground">MiniAlgothon</span>
            <span>/</span>
            <span>PRIVACY &amp; DISCLAIMER</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/support"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              Support &amp; FAQ
            </Link>
            <Link href="/login" className="font-mono text-xs text-primary hover:underline">
              Return to Sign In
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-12 sm:py-14">
        <div className="border border-border/80 bg-card p-6 sm:p-10">
          <div className="border-b border-border/60 pb-6">
            <div className="inline-flex items-center gap-2 border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 bg-emerald-500" />
              <span>OPEN SOURCE PROJECT // POLICY</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Platform Privacy &amp; Disclaimer
            </h1>
            <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
              This document outlines data handling, workstation proctoring disclosures, and
              limitations of liability for the MiniAlgothon platform.
            </p>
          </div>

          <div className="mt-8 space-y-8 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            <section aria-labelledby="section-scope" className="space-y-2">
              <h2
                id="section-scope"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                1. Platform Scope
              </h2>
              <p>
                MiniAlgothon is an open-source platform designed for small-scale competitive
                programming contests and hackathons. Access to the administrative console is
                restricted to contest organizers, problem authors, and proctors.
              </p>
            </section>

            <section aria-labelledby="section-proctor" className="space-y-2">
              <h2
                id="section-proctor"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                2. Desktop Proctoring Client
              </h2>
              <p>
                The platform includes a companion proctor application that runs locally on
                competitor computers during active rounds. The proctor monitors workstation activity
                to maintain competition integrity:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Foreground application focus and active window titles.</li>
                <li>Running process names.</li>
                <li>Heartbeat intervals to confirm client connectivity.</li>
              </ul>
              <p>
                Telemetry collection occurs while the proctor client is running during a contest
                round. Data is used for verifying fair competition.
              </p>
            </section>

            <section aria-labelledby="section-disclaimer" className="space-y-2">
              <h2
                id="section-disclaimer"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                3. Proctor Software &amp; Platform Liability Disclaimer
              </h2>
              <p>
                MiniAlgothon and its proctoring client are open-source software provided &quot;AS
                IS&quot; and &quot;AS AVAILABLE&quot; without warranties of any kind.
              </p>
              <p>
                The creators, authors, and maintainers accept{" "}
                <strong className="text-foreground">no responsibility or liability</strong> for
                proctor monitoring, local computer configurations, operating system behavior, or
                competition outcomes. Contest organizers and participants run the software at their
                own discretion.
              </p>
            </section>

            <section aria-labelledby="section-submissions" className="space-y-2">
              <h2
                id="section-submissions"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                4. Code Evaluation &amp; Submissions
              </h2>
              <p>
                Competitor submissions are evaluated against predefined test cases. Source code
                submissions and evaluation results are accessible to authorized contest organizers
                and judging components.
              </p>
            </section>

            <section aria-labelledby="section-audit" className="space-y-2">
              <h2
                id="section-audit"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                5. Administrative Operations
              </h2>
              <p>
                Administrative actions including problem creation, testcase updates, score
                adjustments, and user account operations are recorded to ensure contest integrity.
              </p>
            </section>

            <section aria-labelledby="section-contact" className="space-y-2">
              <h2
                id="section-contact"
                className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                6. Contact
              </h2>
              <p>
                Inquiries regarding platform governance or technical questions can be sent via email
                to{" "}
                <span className="font-mono font-semibold text-foreground">
                  nayanthanethsara@gmail.com
                </span>
                . Answers to common questions are also available on our{" "}
                <Link href="/support" className="text-primary hover:underline">
                  Support &amp; FAQ
                </Link>{" "}
                page.
              </p>
            </section>
          </div>

          <div className="mt-10 border-t border-border/60 pt-6">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <span className="font-mono text-[11px] text-muted-foreground/60">
                MiniAlgothon Open Source // Contact: nayanthanethsara@gmail.com
              </span>
              <div className="flex items-center gap-3">
                <Link
                  href="/support"
                  className="inline-flex items-center justify-center border border-border bg-card px-4 py-2 font-mono text-xs text-foreground transition-colors hover:bg-muted"
                >
                  Support &amp; FAQ
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center border border-border bg-card px-4 py-2 font-mono text-xs text-foreground transition-colors hover:bg-muted"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
