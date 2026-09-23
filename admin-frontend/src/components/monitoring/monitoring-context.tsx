"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { getMonitoringSnapshotAction } from "@/lib/actions/monitoring";
import { MONITORING_SECTIONS, type MonitoringSection } from "@/types/monitoring";
import type { CompetitorHeartbeat } from "@/types/telemetry";
import type { CompetitorRisk, EnrolledAgent, ProctorOverview } from "@/types/proctor";

export const POLL_INTERVAL_MS = 10_000;

/**
 * Which sections the page at this path needs. The fleet header sits above all
 * three, so `overview` is always included.
 */
export function sectionsForPath(pathname: string): MonitoringSection[] {
  if (pathname.startsWith("/monitoring/risk")) return ["overview", "risk"];
  if (pathname.startsWith("/monitoring/agents")) return ["overview", "agents"];
  return ["overview", "telemetry"];
}

type MonitoringState = {
  overview: ProctorOverview | null;
  telemetry: CompetitorHeartbeat[];
  risk: CompetitorRisk[];
  agents: EnrolledAgent[];
  /**
   * Sections that have returned at least once. Skeletons key off this rather
   * than off `isRefreshing`, so a ten-second poll never flashes a populated
   * table back to placeholders.
   */
  loaded: Partial<Record<MonitoringSection, boolean>>;
  isRefreshing: boolean;
  loadError: string | null;
  isAutoRefreshActive: boolean;
  setAutoRefreshActive: (active: boolean) => void;
  refreshNow: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
};

const MonitoringContext = createContext<MonitoringState | null>(null);

export function useMonitoring(): MonitoringState {
  const ctx = useContext(MonitoringContext);
  if (!ctx) throw new Error("useMonitoring must be used inside <MonitoringProvider>");
  return ctx;
}

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [overview, setOverview] = useState<ProctorOverview | null>(null);
  const [telemetry, setTelemetry] = useState<CompetitorHeartbeat[]>([]);
  const [risk, setRisk] = useState<CompetitorRisk[]>([]);
  const [agents, setAgents] = useState<EnrolledAgent[]>([]);
  const [loaded, setLoaded] = useState<Partial<Record<MonitoringSection, boolean>>>({});

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAutoRefreshActive, setAutoRefreshActive] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // A Server Action cannot be aborted, so a superseded refresh is discarded on
  // arrival instead: navigating between pages, hitting Refresh or unmounting
  // bumps this, and a reply that does not match is dropped rather than
  // overwriting newer rows with older ones.
  const generation = useRef(0);

  const load = useCallback(async (sections: MonitoringSection[]) => {
    const mine = ++generation.current;
    setIsRefreshing(true);
    try {
      const result = await getMonitoringSnapshotAction(sections);
      if (mine !== generation.current) return;

      if (result.unauthenticated) {
        window.location.href = "/login";
        return;
      }
      if (result.error || !result.snapshot) {
        setLoadError(result.error ?? "Monitoring feed unavailable.");
        return;
      }

      const snapshot = result.snapshot;
      if (snapshot.overview) setOverview(snapshot.overview);
      if (snapshot.telemetry) setTelemetry(snapshot.telemetry);
      if (snapshot.risk) setRisk(snapshot.risk);
      if (snapshot.agents) setAgents(snapshot.agents);

      const errors = snapshot.errors ?? {};
      // A section counts as loaded once it answers, even with an empty list --
      // "no contestants yet" is an answer, and must not skeleton forever.
      setLoaded((prev) => {
        const next = { ...prev };
        for (const section of sections) {
          if (!errors[section]) next[section] = true;
        }
        return next;
      });

      const failed = Object.keys(errors);
      setLoadError(failed.length > 0 ? `Could not refresh: ${failed.join(", ")}.` : null);
    } finally {
      if (mine === generation.current) setIsRefreshing(false);
    }
  }, []);

  const refreshNow = useCallback(() => {
    void load([...MONITORING_SECTIONS]);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    // Chained timeouts rather than setInterval: a tick that outran the interval
    // used to have the next one start on top of it, so the console got slower
    // exactly when the API was already struggling.
    const tick = async () => {
      await load(sectionsForPath(pathname));
      if (stopped || !isAutoRefreshActive) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    const start = async () => {
      // Every section on the way in, so the counts on the pages nobody is
      // looking at are populated too; the polled ticks refresh only this page's.
      await load([...MONITORING_SECTIONS]);
      if (stopped || !isAutoRefreshActive) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void start();

    return () => {
      stopped = true;
      // Bumping the counter here is the point: it invalidates a reply still in
      // flight. The rule guards against reading a stale DOM node on cleanup,
      // which this is not.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, isAutoRefreshActive, load]);

  return (
    <MonitoringContext.Provider
      value={{
        overview,
        telemetry,
        risk,
        agents,
        loaded,
        isRefreshing,
        loadError,
        isAutoRefreshActive,
        setAutoRefreshActive,
        refreshNow,
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
}
