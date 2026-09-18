import Link from "next/link";
import type { Metadata } from "next";
import { CopyEmailButton } from "@/components/support/copy-email-button";

export const metadata: Metadata = {
  title: "Support & FAQ - Algothon",
  description:
    "Platform information, proctoring disclaimers, frequently asked questions, and maintainer contact.",
};

const SUPPORT_EMAIL = "nayanthanethsara@gmail.com";

const FAQ_ITEMS = [
  {
    question: "What is Algothon and what scale is it designed for?",
    answer:
      "Algothon is an open-source platform designed for small-scale competitive programming competitions, university clubs, and local hackathons. It provides problem management, submission judging, and workstation monitoring tools in a unified setup.",
  },
  {
    question: "What is the Proctor client and what does it monitor?",
    answer:
      "The proctor is a companion application that contestants run on their computers during a contest round. It monitors active window titles and running processes to help organizers maintain competition integrity and prevent unauthorized external tools.",
  },
  {
    question: "What is the liability disclaimer regarding the Proctor software?",
    answer:
      "Algothon and its proctor client are open-source software provided strictly 'AS IS'. The authors and maintainers accept no responsibility or liability for proctor monitoring, local machine configurations, or contest operations. Organizers and participants run the software at their own discretion.",
  },
  {
    question: "How are submitted solutions evaluated?",
    answer:
      "Competitor submissions are compiled and executed against problem test cases within configured execution time and memory limits.",
  },
  {
    question: "Is there phone or live chat support?",
    answer:
      "No. All inquiries, questions, and support are handled exclusively through email at nayanthanethsara@gmail.com. There are no phone lines, live chat desks, or ticketing portals.",
  },
  {
    question: "How do I report a bug or contact the maintainer?",
    answer:
      "Send an email directly to nayanthanethsara@gmail.com with a description of the issue, steps to reproduce, and any relevant logs.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/40 px-6 py-4 sm:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Algothon</span>
            <span>/</span>
            <span>SUPPORT &amp; FAQ</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link href="/login" className="font-mono text-xs text-primary hover:underline">
              Return to Sign In
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-12 sm:py-14">
        <div className="space-y-8">
          {/* Header Banner */}
          <div className="border border-border/80 bg-card p-6 sm:p-10">
            <div className="inline-flex items-center gap-2 border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 bg-emerald-500" />
              <span>OPEN SOURCE PROJECT // SUPPORT</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Support &amp; Frequently Asked Questions
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Algothon is an open-source platform for small-scale competitive programming
              competitions. Review common questions, platform disclaimers, and contact details
              below.
            </p>
          </div>

          {/* Platform Notice & Proctor Disclaimer */}
          <div className="border border-border/80 bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
              <span>Platform Notice &amp; Proctor Disclaimer</span>
            </div>
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              <p>
                <strong className="text-foreground">Open-Source Project:</strong> This software is
                distributed on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis, without
                warranties of any kind.
              </p>
              <p>
                <strong className="text-foreground">Proctoring Software:</strong> The desktop
                proctor application runs locally on competitor computers to monitor active windows
                and running processes. The creators and maintainers{" "}
                <strong className="text-foreground">assume zero responsibility or liability</strong>{" "}
                for proctor monitoring, local machine configurations, operating system behavior, or
                contest operations. Organizers and competitors use the software at their own
                discretion.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="border border-border/80 bg-card p-6 sm:p-8">
            <div className="border-b border-border/60 pb-4">
              <h2 className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
                Frequently Asked Questions
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Common operational and technical questions.
              </p>
            </div>

            <div className="mt-6 divide-y divide-border/60">
              {FAQ_ITEMS.map((item, index) => (
                <details key={item.question} className="group py-4 first:pt-0 last:pb-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-mono text-xs font-medium text-foreground transition-colors hover:text-primary sm:text-sm">
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted-foreground/60">
                        {String(index + 1).padStart(2, "0")}.
                      </span>
                      <span>{item.question}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground group-open:rotate-180 transition-transform">
                      ↓
                    </span>
                  </summary>
                  <p className="mt-3 pl-6 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>

          {/* Contact Support Section */}
          <div className="border border-border/80 bg-card p-6 sm:p-8">
            <div className="border-b border-border/60 pb-4">
              <h2 className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
                Contact Maintainer
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                All inquiries and support are handled exclusively through email. No phone numbers,
                messaging channels, or support tickets are maintained.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-4 border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Contact Email
                </span>
                <span className="font-mono text-sm font-semibold text-foreground sm:text-base">
                  {SUPPORT_EMAIL}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyEmailButton email={SUPPORT_EMAIL} />
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Algothon%20Inquiry`}
                  className="inline-flex h-8 items-center justify-center border border-border bg-card px-3 font-mono text-xs text-foreground transition-colors hover:bg-muted"
                >
                  Open Email Client
                </a>
              </div>
            </div>
          </div>

          {/* Navigation Footer */}
          <div className="flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center font-mono text-xs text-muted-foreground">
            <span>Algothon Open Source</span>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
                Privacy Policy
              </Link>
              <Link href="/login" className="hover:text-foreground underline underline-offset-2">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
