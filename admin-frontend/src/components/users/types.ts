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
    key: "webOnly",
    label: "Browser Only (No Proctor Agent)",
    badge: "BROWSER ONLY",
    className: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    cost: "Exemption: Allows scored submissions directly from a browser without requiring any running proctor agent on the contestant machine.",
    reasonHint: "Proctor client cannot be installed on this machine (e.g. locked Chromebook)",
  },
];

export function grantOf(user: User): AccessGrant {
  return {
    webWithAgent: true,
    webOnly: user.proctorAllowWebOnly ?? false,
  };
}

export interface ParsedCsvRow {
  username: string;
  displayName?: string;
  teamName?: string;
  password?: string;
  isValid: boolean;
  validationError?: string;
}
