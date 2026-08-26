import { BookOpen, Code2, History, Trophy } from "lucide-react";
import { CHALLENGE_STATUS, type ChallengeStatus } from "@/types/challenge";
import type { SnapshotTrigger } from "@/types/history";
import type { AccessMode } from "@/types/proctor";

export const CONTEST_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  ENDED: "ENDED",
} as const;

export const POLL_HEALTHY_MS = 15_000;
export const POLL_DEGRADED_MS = 5_000;
export const LEADERBOARD_POLL_INTERVAL_MS = 10_000;
export const PROBE_TIMEOUT_MS = 700;

export const LOOPBACK_PORTS = [47615, 47616, 47617, 47618, 47619] as const;
export const AGENT_HOST = "127.0.0.1";

export const MAX_CODE_LENGTH = 100_000;
export const MAX_STDIN_LENGTH = 1_000_000;
export const MAX_HISTORY_SNAPSHOTS = 50;

export const THEME_STORAGE_KEY = "minialgothon_challenge_theme";
export const BEST_SCORE_STORAGE_PREFIX = "mini-algothon:best:";
export const HISTORY_STORAGE_PREFIX = "mini-algothon:history:";

export const NAV_LINKS = [
  { href: "/challenges", label: "Challenges", icon: Code2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/submissions", label: "Submissions", icon: History },
  { href: "/docs", label: "Docs", icon: BookOpen },
] as const;

export const CHALLENGE_STATUS_LABELS: Record<ChallengeStatus, string> = {
  [CHALLENGE_STATUS.SOLVED]: "Solved",
  [CHALLENGE_STATUS.ATTEMPTED]: "In progress",
  [CHALLENGE_STATUS.NOT_ATTEMPTED]: "Unopened",
};

export const PROCTOR_MODE_LABELS: Record<AccessMode, string> = {
  DESKTOP: "the proctor client window",
  WEB_WITH_AGENT: "a browser, with the proctor client running",
  WEB_ONLY: "a browser, with no proctor client running",
};

export const PROCTOR_LOCK_TITLES: Record<string, string> = {
  CLIENT_NOT_ALLOWED: "Browser Access Not Permitted",
  AGENT_MISSING: "Proctor Client Required",
  AGENT_STOPPED: "Proctor Client Stopped",
  ENROLLMENT_REVOKED: "Enrollment Revoked",
  AGENT_UNREACHABLE: "Proctor Client Unreachable",
  AGENT_STALE: "Proctor Connection Stale",
  AGENT_STARTING: "Proctor Client Starting",
};

export const PROCTOR_TRANSIENT_CODE = "AGENT_STARTING";

export const VERDICT_DETAILS: Record<
  string,
  { label: string; variant: "success" | "destructive" | "warning" }
> = {
  AC: { label: "Accepted (AC)", variant: "success" },
  WA: { label: "Wrong answer (WA)", variant: "destructive" },
  TLE: { label: "Time limit exceeded (TLE)", variant: "warning" },
  RTE: { label: "Runtime error (RTE)", variant: "destructive" },
  MLE: { label: "Memory limit exceeded (MLE)", variant: "warning" },
  OLE: { label: "Output limit exceeded (OLE)", variant: "destructive" },
  CE: { label: "Compilation error (CE)", variant: "destructive" },
  IE: { label: "Internal sandbox error (IE)", variant: "destructive" },
  SK: { label: "Skipped (SK)", variant: "warning" },
};

export const SNAPSHOT_TRIGGER_LABELS: Record<SnapshotTrigger, string> = {
  autosave: "Autosave",
  ran: "Ran",
  submitted: "Submitted",
};

export const DIFFICULTY_RANKS: Record<string, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

export const CHALLENGE_SORT_OPTIONS = [
  { value: "DEFAULT", label: "Default order" },
  { value: "POINTS_DESC", label: "XP: high to low" },
  { value: "POINTS_ASC", label: "XP: low to high" },
  { value: "DIFFICULTY_ASC", label: "Difficulty: easy to hard" },
  { value: "DIFFICULTY_DESC", label: "Difficulty: hard to easy" },
  { value: "TITLE_ASC", label: "Title: A to Z" },
] as const;

export const SUBMISSION_SORT_OPTIONS = [
  { value: "NEWEST", label: "Newest first" },
  { value: "OLDEST", label: "Oldest first" },
  { value: "SCORE_DESC", label: "Score: highest first" },
  { value: "STATUS_ASC", label: "Status: verdict A-Z" },
  { value: "TITLE_ASC", label: "Challenge: A to Z" },
] as const;

export const LEADERBOARD_SORT_OPTIONS = [
  { value: "RANK_ASC", label: "Rank: #1 to last" },
  { value: "SCORE_DESC", label: "Score: high to low" },
  { value: "SCORE_ASC", label: "Score: low to high" },
  { value: "SOLVED_DESC", label: "Solved: most to least" },
  { value: "NAME_ASC", label: "Team: A to Z" },
] as const;

