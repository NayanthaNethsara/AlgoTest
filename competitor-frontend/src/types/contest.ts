export const CONTEST_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  ENDED: "ENDED",
} as const;

export type ContestStatus =
  (typeof CONTEST_STATUS)[keyof typeof CONTEST_STATUS];

export type ContestState = {
  title: string;
  status: ContestStatus;
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds: number;
  freezeMinutes: number;
  pausedAt?: string | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  isFrozen: boolean;
  serverTime: string;
};

export const CONTEST_THRESHOLDS_SECONDS = [
  { seconds: 30 * 60, label: "30 minutes", variant: "info" as const },
  { seconds: 15 * 60, label: "15 minutes", variant: "warning" as const },
  { seconds: 10 * 60, label: "10 minutes", variant: "warning" as const },
  { seconds: 5 * 60, label: "5 minutes", variant: "destructive" as const },
  { seconds: 60, label: "1 minute", variant: "destructive" as const },
] as const;

export type ContestAlert = {
  id: string;
  title: string;
  description: string;
  variant: "info" | "warning" | "destructive" | "success";
};

