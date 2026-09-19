import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { DesktopWindowControls } from "@/components/portal/desktop-window-controls";
import { getSessionUser } from "@/lib/auth/session";

const INFO_CARDS = [
  {
    title: "Automated Judging",
    body: "Solutions are compiled and run against hidden test cases in an isolated sandbox, under configurable time and memory limits.",
  },
  {
    title: "Workstation Proctoring",
    body: "The Desktop Proctor client must stay running for the duration of the contest — it watches for local AI runtimes and a second route to the internet.",
  },
  {
    title: "Live Leaderboard",
    body: "Ranked by total problems solved, with a time penalty applied per failed submission.",
  },
];

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/challenges");

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-background select-none lg:h-dvh lg:overflow-hidden">
      <div className="flex w-full flex-col lg:h-full lg:grid lg:grid-cols-12">
        {/* Left Column: Platform Information */}
        <section
          aria-label="Platform Information"
          className="hidden flex-col justify-between border-r-2 border-black bg-card/40 p-8 xl:p-12 lg:flex lg:col-span-7 xl:col-span-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 pixel-flat bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              <span className="size-1.5 bg-primary" />
              <span>COMPETITOR PORTAL</span>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/algothon.svg"
                alt="Algothon"
                className="h-6 w-auto object-contain"
              />
              <span
                className="text-muted-foreground/60 text-base leading-none select-none"
                aria-hidden="true"
              >
                |
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Powered by
              </span>
              <Image
                src="/logo/gtn-white.png"
                alt="GTN"
                width={1200}
                height={540}
                className="h-7 w-auto object-contain"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Algorithm contest platform for competitors.
            </p>
          </div>

          <div className="my-auto space-y-2.5 py-4 xl:space-y-3">
            {INFO_CARDS.map((card) => (
              <div key={card.title} className="pixel-flat bg-card p-3">
                <div className="font-mono text-[11px] font-semibold text-foreground">
                  {card.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {card.body}
                </p>
              </div>
            ))}

            <div className="border-l-2 border-primary bg-primary/5 p-3">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-primary uppercase">
                Open-Source Project Notice
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Algothon is free and open-source, provided &quot;as is&quot;. See the{" "}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Privacy &amp; Support
                </Link>{" "}
                for exactly what the proctor client monitors.
              </p>
            </div>
          </div>

          <div className="border-t-2 border-black pt-3 font-mono text-[10px] text-muted-foreground/60">
            OPEN SOURCE COMPETITIVE PROGRAMMING PLATFORM
          </div>
        </section>

        {/* Right Column: Authentication Panel */}
        <section
          aria-label="Competitor Authentication"
          className="flex min-h-dvh flex-col p-6 sm:p-8 lg:h-full lg:min-h-0 lg:col-span-5 lg:p-8 xl:col-span-4 xl:p-12"
        >
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/algothon.svg"
                alt="Algothon"
                className="h-5 w-auto shrink object-contain"
              />
              <span
                className="text-muted-foreground/60 text-sm leading-none select-none shrink-0"
                aria-hidden="true"
              >
                |
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                Powered by
              </span>
              <Image
                src="/logo/gtn-white.png"
                alt="GTN"
                width={1200}
                height={540}
                className="h-5 w-auto shrink object-contain"
              />
            </div>
            <DesktopWindowControls className="ml-auto flex items-center gap-1 select-none shrink-0" />
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto w-full max-w-md">
              <div>
                <h2 className="text-lg font-pixel-header text-primary tracking-wide">
                  Sign In
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in with your competitor credentials.
                </p>
              </div>

              <div className="mt-6">
                <LoginForm />
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md border-t-2 border-black pt-3 space-y-2">
            <p className="text-center text-[10px] text-warning">
              Beta Release — sorry for any inconvenience.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-mono text-[10px] text-muted-foreground/50 sm:justify-between sm:text-left">
              <span>ALGOTHON 2026</span>
              <div className="flex items-center gap-2">
                <Link
                  href="/rules"
                  className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2"
                >
                  Rules
                </Link>
                <span>·</span>
                <Link
                  href="/privacy"
                  className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2"
                >
                  Privacy &amp; Support
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
