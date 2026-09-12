"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, LockIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import { getErrorMessage } from "@/lib/errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-125 w-175 -translate-x-1/2 rounded-full bg-linear-to-tr from-primary/10 via-primary/5 to-transparent opacity-60 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/2 h-125 w-175 -translate-x-1/2 rounded-full bg-linear-to-br from-primary/10 via-transparent to-transparent opacity-40 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm">
        <Card className="bg-card/85 shadow-2xl backdrop-blur-xl">
          <CardHeader className="items-center gap-3 pt-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-6" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold tracking-tight">MiniAlgothon</CardTitle>
                <Badge
                  variant="outline"
                  className="border-primary/25 bg-primary/10 text-[10px] font-semibold tracking-wider text-primary uppercase"
                >
                  Admin
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Sign in to the contest management console.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-6">
            <form onSubmit={handleLogin} noValidate>
              <FieldGroup>
                {error && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Field>
                  <FieldLabel htmlFor="username" className="gap-1.5 text-xs">
                    <UserIcon className="size-3.5 text-muted-foreground" /> Username
                  </FieldLabel>
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
                    className="h-9"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="password" className="gap-1.5 text-xs">
                    <LockIcon className="size-3.5 text-muted-foreground" /> Password
                  </FieldLabel>
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
                    className="h-9"
                  />
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || !username.trim() || !password}
                  className="w-full gap-2 text-xs font-semibold"
                >
                  {loading ? (
                    <>
                      <Spinner /> Verifying credentials…
                    </>
                  ) : (
                    <>
                      Sign in to console <ArrowRightIcon />
                    </>
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/60">
          MiniAlgothon Competitive Programming Platform
        </p>
      </div>
    </main>
  );
}
