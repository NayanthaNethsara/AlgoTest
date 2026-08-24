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

export type ContestSettingsInput = {
  title?: string;
  durationMinutes?: number;
  freezeMinutes?: number;
};
