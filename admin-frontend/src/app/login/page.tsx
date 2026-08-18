"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Loader2, Lock, ShieldCheck, User as UserIcon } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

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
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Subtle ambient gradient mesh in background */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-gradient-to-tr from-cyan-600/10 via-indigo-600/10 to-transparent blur-3xl opacity-50" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-gradient-to-br from-violet-600/10 via-cyan-600/10 to-transparent blur-3xl opacity-40" />

      <div className="relative z-10 w-full max-w-md">
        <Card className="shadow-2xl border border-white/10 bg-card/85 backdrop-blur-xl transition-all">
          <CardHeader className="flex flex-col items-center gap-3 text-center pb-2 pt-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 mb-1.5">
                <CardTitle className="text-xl font-bold tracking-tight">MiniAlgothon</CardTitle>
                <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Enter your credentials to access the contest management console.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pt-4 pb-8 px-7">
            {error && (
              <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/90 flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" /> Username
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className="h-10 text-xs bg-background/60 border-white/10 focus-visible:ring-primary/40"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/90 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-10 text-xs bg-background/60 border-white/10 focus-visible:ring-primary/40"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-10 text-xs font-semibold gap-2 shadow-sm transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying Credentials...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" /> Sign In to Console{" "}
                    <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/60 mt-4">
          MiniAlgothon Competitive Programming Platform
        </p>
      </div>
    </main>
  );
}
