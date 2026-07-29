"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

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
      const res = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      const loginData = await res.json();
      if (loginData.sessionToken) {
        localStorage.setItem("admin_token", loginData.sessionToken);
      }

      const meRes = await apiFetch("/api/v1/me");
      if (!meRes.ok) throw new Error("Failed to verify user session");

      const user = await meRes.json();
      if (user.role !== "admin") {
        throw new Error("Access denied: Admin role required");
      }

      router.push("/");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xl">
        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Organizer Console</h1>
          <p className="text-xs text-muted-foreground">Sign in with your admin credentials to manage MiniAlgothon.</p>
        </div>

        {error && (
          <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              className="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Admin Console"}
          </button>
        </form>
      </div>
    </div>
  );
}
