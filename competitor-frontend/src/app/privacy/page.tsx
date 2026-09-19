import { getDisclosureAction } from "@/actions/disclosure";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/legal-page";

export const metadata = {
  title: "Privacy & Support — Algothon",
};

function AboutSection() {
  return (
    <LegalSection title="About This Platform">
      <p>
        Algothon is an independent student project — it is free and
        open-source, provided as-is with no guaranteed uptime or support
        commitment.
      </p>
      <p>
        It is not an official platform of, endorsed by, or affiliated with
        GTN or SLIIT, and neither is responsible for it.
      </p>
    </LegalSection>
  );
}

function SupportSection() {
  return (
    <LegalSection title="Support">
      <p>
        Login problems, a broken problem statement, a proctor client that
        won&apos;t connect, anything during a contest — contact the
        organizing committee through the official WhatsApp group. That&apos;s
        the only support channel there is; there&apos;s no ticketing system or
        support email behind this. We&apos;ll help where we can, but we
        can&apos;t promise a fix or a timeline.
      </p>
    </LegalSection>
  );
}

export default async function PrivacyPage() {
  const data = await getDisclosureAction();

  if (!data) {
    return (
      <LegalPage title="Privacy & Support">
        <AboutSection />
        <LegalSection title="Unable to Load">
          <p>
            The published disclosure couldn&apos;t be reached from here. This
            content is served live from the contest server rather than
            hardcoded, so it can be corrected without a client update — ask an
            organizer if you need it right now.
          </p>
        </LegalSection>
        <SupportSection />
      </LegalPage>
    );
  }

  const { disclosure, probedPorts } = data;

  return (
    <LegalPage
      title="Privacy & Support"
      description={`What the Desktop Proctor client does, published in full so it can be checked against — not taken on faith. Disclosure version ${disclosure.version}.`}
    >
      <AboutSection />

      <LegalSection title="Summary">
        <p>{disclosure.summary}</p>
      </LegalSection>

      <LegalSection title="What Is Collected">
        <LegalList items={disclosure.collected} />
      </LegalSection>

      <LegalSection title="What Is Never Collected">
        <LegalList items={disclosure.notCollected} />
      </LegalSection>

      <LegalSection title="How It Behaves">
        <LegalList items={disclosure.lifecycle} />
      </LegalSection>

      {probedPorts.length > 0 && (
        <LegalSection title="Local AI Ports Checked">
          <p className="mb-2">
            Only 127.0.0.1, only these ports, and only to see whether a local
            LLM API answers. No other machine on the network is contacted or
            scanned.
          </p>
          <LegalList
            items={probedPorts.map((p) => `${p.port} — ${p.product}`)}
          />
        </LegalSection>
      )}

      <LegalSection title="Retention & Review">
        <p>{disclosure.retention}</p>
        <p>{disclosure.policy}</p>
      </LegalSection>

      <SupportSection />
    </LegalPage>
  );
}
