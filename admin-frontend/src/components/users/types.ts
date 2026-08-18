import type { User } from "@/types/user";

export type Credential = { username: string; password: string; teamName?: string };

export type AccessGrant = { webWithAgent: boolean; webOnly: boolean };

export const FALLBACKS: {
  key: keyof AccessGrant;
  label: string;
  badge: string;
  className: string;
  cost: string;
  reasonHint: string;
}[] = [
  {
    key: "webWithAgent",
    label: "Browser, proctor running",
    badge: "BROWSER +AGENT",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    cost: "Allows scored submissions from an ordinary browser, as long as the proctor client keeps reporting from the same machine. Endpoint signals still land; nothing corroborates which window the code was typed in.",
    reasonHint: "Desktop shell will not open on this machine",
  },
  {
    key: "webOnly",
    label: "Browser, no proctor",
    badge: "BROWSER ONLY",
    className: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    cost: "Allows scored submissions from a browser with no proctor client at all. No endpoint signals will exist for this contestant.",
    reasonHint: "Proctor client cannot be installed on this machine",
  },
];

export function grantOf(user: User): AccessGrant {
  return {
    webWithAgent: user.proctorAllowWebWithAgent ?? false,
    webOnly: user.proctorAllowWebOnly ?? false,
  };
}

export function isPerverse(grant: AccessGrant): boolean {
  return grant.webOnly && !grant.webWithAgent;
}

export interface ParsedCsvRow {
  username: string;
  displayName?: string;
  teamName?: string;
  password?: string;
  isValid: boolean;
  validationError?: string;
}
