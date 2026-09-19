import Link from "next/link";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/legal-page";

export const metadata = {
  title: "Rules — Algothon",
};

const LANGUAGES = [
  { name: "C++", version: "GCC 13 (C++17)" },
  { name: "Python", version: "Python 3.12" },
  { name: "Java", version: "OpenJDK 17 / 21" },
  { name: "Rust", version: "rustc 1.77+ (2021 Edition)" },
  { name: "C", version: "GCC 13 (C17)" },
  { name: "JavaScript", version: "Node.js 20 LTS" },
];

export default function RulesPage() {
  return (
    <LegalPage
      title="Contest Rules"
      description="The short version. If anything here is unclear, ask an organizer before the contest starts."
    >
      <LegalSection title="Supported Languages">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {LANGUAGES.map((lang) => (
            <div key={lang.name} className="pixel-flat bg-card p-3">
              <div className="font-mono text-[11px] font-semibold text-foreground">
                {lang.name}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {lang.version}
              </div>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="During the Contest">
        <LegalList
          items={[
            "Keep the contest portal open. Challenges and status updates appear automatically without a manual refresh.",
            "The Desktop Proctor client must stay running for the duration of the contest — closing it locks scored submissions until it reconnects.",
            "Submitted solutions are compiled and run against hidden test cases inside an isolated sandbox.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Scoring">
        <LegalList
          items={[
            "The leaderboard ranks contestants by total problems solved, with a time penalty applied per failed submission.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Proctoring & Fair Play">
        <p>
          <strong className="text-foreground">No AI usage is allowed</strong>{" "}
          during the contest — no ChatGPT, Copilot, local LLMs, or similar
          tools.
        </p>
        <p>
          The Desktop Proctor client watches for a few specific signals,
          including local AI runtimes, during the contest — see{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-2">
            Privacy &amp; Support
          </Link>{" "}
          for the full, published list of what is and isn&apos;t collected.
        </p>
        <p>
          Flagged signals go to a human for review — nothing is auto-disqualified.
          If something looks off, an organizer will reach out.
        </p>
      </LegalSection>

      <LegalSection title="Getting Help">
        <p>
          Questions or issues before or during the contest go to the organizing
          committee via the official WhatsApp group — see{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-2">
            Privacy &amp; Support
          </Link>{" "}
          for details.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
