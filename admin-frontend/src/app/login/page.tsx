"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginAction } from "@/lib/actions/auth";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginAction(username, password);
      if (!res.success) {
        throw new Error(res.error || "Invalid organizer credentials");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, "Authentication failed."));
      setLoading(false);
    }
  }

  return (
    <main className="h-screen w-screen overflow-y-auto bg-background lg:overflow-hidden">
      <div className="grid h-full w-full lg:grid-cols-12">
        {/* Left Column: Platform Information and Security Disclosures */}
        <section
          aria-label="Platform Information"
          className="hidden flex-col justify-between border-r border-border/80 bg-card/40 p-8 xl:p-12 lg:flex lg:col-span-7 xl:col-span-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 border border-border/80 bg-muted/40 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <span className="size-1.5 bg-emerald-500" />
              <span>ORGANIZER CONSOLE</span>
            </div>

            <div className="mt-4">
              <h1 className="text-xl font-bold tracking-tight text-foreground xl:text-2xl">
                Algothon Control Plane
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Platform for managing small-scale competitive programming competitions.
              </p>
            </div>
          </div>

          <div className="my-auto space-y-2.5 py-4 xl:space-y-3">
            <div className="border border-border/70 bg-card p-3">
              <div className="font-mono text-[11px] font-semibold text-foreground">
                Automated Submission Judging
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Executes contestant code against test cases with configurable execution time and
                memory limits.
              </p>
            </div>

            <div className="border border-border/70 bg-card p-3">
              <div className="font-mono text-[11px] font-semibold text-foreground">
                Workstation Proctoring
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Monitors active window titles and running processes on competitor computers during
                the contest to maintain fair play.
              </p>
            </div>

            <div className="border border-border/70 bg-card p-3">
              <div className="font-mono text-[11px] font-semibold text-foreground">
                Contest Operations
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Manage problems, test cases, teams, and live scoreboards from an integrated
                administrative dashboard.
              </p>
            </div>

            <div className="border-l-2 border-primary bg-primary/5 p-3">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-primary uppercase">
                Open-Source Project Notice
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Algothon is an open-source project provided &quot;AS IS&quot;. The proctor runs
                locally on competitor PCs. Maintainers assume no responsibility or liability for
                proctor monitoring, local computer configurations, or contest operations.
              </p>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 font-mono text-[10px] text-muted-foreground/60">
            OPEN SOURCE COMPETITIVE PROGRAMMING PLATFORM
          </div>
        </section>

        {/* Right Column: Authentication Panel */}
        <section
          aria-label="Operator Authentication"
          className="flex h-full flex-col justify-between p-6 sm:p-10 lg:col-span-5 lg:p-8 xl:col-span-4 xl:p-12"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-tight text-foreground">Algothon</span>
          </div>

          <div className="my-auto w-full py-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Organizer Authentication
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your administrative credentials to sign in.
              </p>
            </div>

            <form onSubmit={handleLogin} noValidate className="mt-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="username" className="block font-mono text-[11px] text-foreground">
                  Username
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-8.5 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="block font-mono text-[11px] text-foreground">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-8.5 text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="h-8.5 w-full text-xs font-medium"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-3.5" />
                    Verifying credentials...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-5 border-t border-border/60 pt-3">
              <p className="font-mono text-[10px] leading-normal text-muted-foreground/60">
                Authorized access only. For questions or assistance, contact support.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/40 pt-3 font-mono text-[10px] text-muted-foreground/50">
            <span>INTERNAL OPERATIONS · PRIVATE</span>
            <div className="flex items-center gap-2">
              <Link
                href="/support"
                className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2"
              >
                Support &amp; FAQ
              </Link>
              <span>·</span>
              <Link
                href="/privacy"
                className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
