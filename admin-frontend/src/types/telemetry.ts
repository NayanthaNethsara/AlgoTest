export type TelemetryStatus = "ONLINE" | "STALE" | "OFFLINE";

/** Which client the contestant is actually using, derived server-side from the
 * agent's shell_alive report and the browser lane's own ping. */
export type TelemetryClientType = "DESKTOP" | "WEB" | "NONE";

export type CompetitorHeartbeat = {
  user_id: string;
  username: string;
  display_name: string;
  team_id?: string;
  team_name?: string;
  active_window: string;
  os_info: string;
  ip_address: string;
  agent_version: string;
  shell_alive: boolean;
  internet_reachable: boolean;
  process_matches: string[];
  client_type: TelemetryClientType;
  last_ping_at: string;
  status: TelemetryStatus;
  /** False when this contestant has never enrolled a proctor agent at all. */
  enrolled: boolean;
  offline_seconds: number;
  /** An open blackout: dark with no clean shutdown recorded. */
  in_gap: boolean;
  gap_started_at?: string | null;
  stopped_reason: string;
  risk_score: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
};
