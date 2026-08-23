import type { CompetitorHeartbeat } from "./telemetry";
import type { CompetitorRisk, EnrolledAgent, ProctorOverview } from "./proctor";

/** The panels the monitoring console can ask for in one call. */
export const MONITORING_SECTIONS = ["overview", "telemetry", "risk", "agents"] as const;

export type MonitoringSection = (typeof MONITORING_SECTIONS)[number];

/**
 * One refresh of the console. Only the requested sections are present, and a
 * section whose upstream call failed is absent from the body and named in
 * `errors` instead — one dead endpoint leaves the rest of the console
 * populated rather than blanking the page mid-contest.
 */
export type MonitoringSnapshot = {
  overview?: ProctorOverview;
  telemetry?: CompetitorHeartbeat[];
  risk?: CompetitorRisk[];
  agents?: EnrolledAgent[];
  incidentOpen?: boolean;
  errors: Partial<Record<MonitoringSection, string>>;
};
