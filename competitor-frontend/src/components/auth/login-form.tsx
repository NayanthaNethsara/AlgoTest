"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authenticateUser } from "@mini-algothon/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The portal's only way in, in the browser and in the desktop client alike.
 *
 * There is no single sign-on from the client's proctor enrolment, by design.
 * Handing the portal a session over the desktop bridge would mean granting the
 * remote portal origin the right to invoke commands inside the client, and one
 * password typed a second time is a smaller cost than that. The two credentials
 * are the same, so what a contestant experiences is one extra sign-in per contest.
 */
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
    <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 font-pixel-body">
      <FormField label="USERNAME">
        <Input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          placeholder="ENTER USERNAME"
        />
      </FormField>
      <FormField label="PASSWORD">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          placeholder="••••••••"
        />
      </FormField>
      {errorMessage && <p className="text-xs text-destructive font-bold uppercase">{errorMessage}</p>}
      <Button type="submit" size="lg" disabled={isAuthenticating} className="mt-2 w-full">
        {isAuthenticating ? "AUTHENTICATING..." : "START CHALLENGE"}
      </Button>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-pixel-body uppercase tracking-wider">
      <span className="text-foreground/80 font-bold">{label}</span>
      {children}
    </label>
  );
}
