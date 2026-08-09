/** What the server knows about this contestant's proctor agent. */
export type ProctorSelfStatus = {
  allowed: boolean;
  code?: string;
  exempt: boolean;
  active_client: "DESKTOP" | "WEB";
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
  seconds_since_ack: number | null;
  buffered: number;
  attest_nonce: string;
  loopback_port: number;
  support_code: string;
  status: string;
};

export type ProctorState = {
  /** True only when the server says scored submissions will be accepted. */
  submissionsAllowed: boolean;
  exempt: boolean;
  code?: string;
  remedy?: string;
  secondsSincePing: number;
  /** Present when the agent was reached over loopback on this machine. */
  local: AgentLocalStatus | null;
  attestNonce: string | null;
  /** False when the portal itself could not reach the contest server. */
  serverReachable: boolean;
  /** False until the first status resolution lands, so nothing flashes a warning. */
  resolved: boolean;
};
