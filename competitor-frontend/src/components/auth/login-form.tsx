"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authenticateUser } from "@mini-algothon/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      const result = await authenticateUser({ username, password });
      if (!result.success) {
        setErrorMessage(result.error || "Invalid username or password.");
        return;
      }
      router.push("/challenges");
      router.refresh();
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col gap-3">
      <FormField label="Username">
        <Input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </FormField>
      <FormField label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </FormField>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button type="submit" disabled={isAuthenticating} className="mt-1">
        {isAuthenticating ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
