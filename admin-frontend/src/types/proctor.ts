export type ProctorFleet = {
  competitors: number;
  enrolled: number;
  online: number;
  stale: number;
  offline: number;
  neverReported: number;
  inGap: number;
  stopped: number;
  browserActive: number;
  exempt: number;
  highRisk: number;
  mediumRisk: number;
};

/**
 * An open incident means the fleet went quiet at once, so the cause is ours — a
 * restart, a reload, a switch — and contestant blackouts are suppressed for its
 * duration. Organizers need to see this before they read anyone's gap record.
 */
export type ProctorIncident = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  affectedAgents: number;
  enrolledAgents: number;
  note: string;
  durationSeconds: number;
};

export type ProctorOverview = {
  fleet: ProctorFleet;
  incident: ProctorIncident | null;
};

export type EnrolledAgent = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  machineId: string;
  platform: string;
  agentVersion: string;
  loopbackPort: number;
  enrolledAt: string;
  lastSeenAt: string | null;
  stoppedAt: string | null;
  stoppedReason: string;
  revokedAt: string | null;
  revokedReason: string;
  inGap: boolean;
};

export type TimelineEntryKind = "event" | "gap" | "finding" | "submission" | "enrollment";

export type TimelineEntry = {
  kind: TimelineEntryKind;
  at: string;
  endedAt?: string | null;
  label: string;
  detail?: string;
  weight?: number;
  count?: number;
  payload?: Record<string, unknown>;
};

export type ProctorTimeline = {
  userId: string;
  username: string;
  displayName: string;
  teamName?: string | null;
  score: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  supportHint: string;
  entries: TimelineEntry[];
};

/**
 * A competitor's risk rollup as `/api/v1/admin/proctor/risk` returns it: the
 * score and finding count, plus which submission fallbacks they hold, because
 * the same finding means something different under a browser grant.
 */
export type CompetitorRisk = {
  userId: string;
  username: string;
  displayName: string;
  proctorExempt: boolean;
  score: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  findingCount: number;
  lastPingAt: string | null;
  allowWebOnly?: boolean;
};

export type EvidenceFinding = {
  id: string;
  ruleId: string;
  title: string;
  category?: string;
  severity?: "HIGH" | "MEDIUM" | "LOW";
  weight?: number;
  occurrences?: number;
  evidence?: unknown;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  detectedAt?: string;
};
