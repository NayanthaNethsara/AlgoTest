export type TelemetryStatus = "ONLINE" | "STALE" | "OFFLINE";
export type TelemetryClientType = "DESKTOP" | "WEB";

export type CompetitorHeartbeat = {
  user_id: string;
  username: string;
  display_name: string;
  team_id?: string;
  team_name?: string;
  active_window: string;
  running_processes: string[];
  os_info: string;
  ip_address: string;
  client_type?: TelemetryClientType;
  last_ping_at: string;
  status: TelemetryStatus;
};

export type TelemetryPingPayload = {
  active_window: string;
  running_processes: string[];
  os_info: string;
  client_type?: TelemetryClientType;
};
