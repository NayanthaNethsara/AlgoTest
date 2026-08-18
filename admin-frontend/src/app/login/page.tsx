"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, ShieldCheck, User as UserIcon } from "lucide-react";
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
        throw new Error(res.error || "Login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border border-border/80">
          <CardHeader className="flex flex-col items-center gap-2 text-center pb-3 pt-6">
            <div className="flex items-center justify-center p-3 rounded-full bg-primary/10 text-primary mb-1">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">
                MiniAlgothon Console
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Sign in with your organizer credentials to access the admin portal.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pt-2 pb-6 px-6">
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" /> Username
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-9 text-xs font-medium gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Authenticating...
                  </>
                ) : (
                  <>
                    Sign In to Console <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
