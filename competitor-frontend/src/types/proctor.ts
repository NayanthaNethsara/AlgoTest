/**
 * How a submission is reaching the server. All three are supported; only the first
 * needs no organizer grant, because the other two each give up something the
 * proctor would otherwise see.
 */
export type AccessMode = "DESKTOP" | "WEB_WITH_AGENT" | "WEB_ONLY";

/** What the server knows about this contestant's proctor agent. */
export type ProctorSelfStatus = {
  allowed: boolean;
  code?: string;
  exempt: boolean;
  active_client: "DESKTOP" | "WEB";
  /** The mode this window resolves to right now, not the best one available. */
  access_mode: AccessMode;
  /** Every mode this account may submit from. The two browser fallbacks are
   *  independent grants, so this is a set rather than a threshold. */
  allowed_modes: AccessMode[];
  last_ping_at?: string | null;
  seconds_since_ping: number;
  remedy?: string;
  loopback_port?: number;
};

/**
 * What the agent reports over 127.0.0.1. Reaching this at all proves the page is
 * running on the same machine as the agent, which is what `attest_nonce` then
 * carries to the server on submit.
 */
export type AgentLocalStatus = {
  agent_version: string;
  boot_id: string;
  seq: number;
  uptime_s: number;
  enrolled: boolean;
  revoked: boolean;
  healthy: boolean;
  starting: boolean;
  seconds_since_ack: number | null;
  buffered: number;
  attest_nonce: string;
  loopback_port: number;
  support_code: string;
  status: string;
  lockdown?: boolean;
  monitor_count?: number;
  multiple_monitors_detected?: boolean;
};

export type ProctorState = {
  /** True only when the server says scored submissions will be accepted. */
  submissionsAllowed: boolean;
  exempt: boolean;
  code?: string;
  remedy?: string;
  /** Null until the first server answer lands; the agent cannot resolve it alone. */
  accessMode: AccessMode | null;
  allowedModes: AccessMode[];
  secondsSincePing: number;
  /** Present when the agent was reached over loopback on this machine. */
  local: AgentLocalStatus | null;
  attestNonce: string | null;
  /** False when the portal itself could not reach the contest server. */
  serverReachable: boolean;
  /** The agent is still coming up; submissions are locked but nothing is wrong. */
  starting: boolean;
  /** False until the first status resolution lands, so nothing flashes a warning. */
  resolved: boolean;
};
