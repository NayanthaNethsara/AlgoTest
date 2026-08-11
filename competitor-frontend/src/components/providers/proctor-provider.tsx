"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getProctorSelfAction } from "@/actions/telemetry";
import { readLocalAgent } from "@/lib/proctor";
import type {
  AgentLocalStatus,
  ProctorSelfStatus,
  ProctorState,
} from "@/types/proctor";

const POLL_HEALTHY_MS = 15_000;
const POLL_DEGRADED_MS = 5_000;

const INITIAL: ProctorState = {
  submissionsAllowed: true,
  exempt: false,
  secondsSincePing: 0,
  local: null,
  attestNonce: null,
  serverReachable: true,
  starting: false,
  resolved: false,
};

const ProctorContext = createContext<ProctorState>(INITIAL);

/**
 * Single source of proctoring state for the portal, polled once and shared.
 *
 * Contestants find out their agent has stopped while they are still coding rather
 * than when they hit submit with ninety seconds left on the clock.
 */
export function ProctorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProctorState>(INITIAL);
  const knownPort = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    // The status poll doubles as the browser-presence record, so tab visibility
    // rides along on it rather than costing a second request.
    const tabVisible = typeof document !== "undefined" ? !document.hidden : true;
    const [self, local] = await Promise.all([
      getProctorSelfAction(tabVisible),
      readLocalAgent(knownPort.current),
    ]);

    if (local?.loopback_port) {
      knownPort.current = local.loopback_port;
    } else if (self?.loopback_port) {
      knownPort.current = self.loopback_port;
    }

    setState({ ...resolve(self, local), resolved: true });
  }, []);

  const degraded =
    state.resolved && (!state.submissionsAllowed || state.starting);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && !cancelled) {
        void tick();
      }
    };

    void tick();
    const timer = setInterval(
      () => {
        if (typeof document === "undefined" || !document.hidden || degraded) {
          void tick();
        }
      },
      degraded ? POLL_DEGRADED_MS : POLL_HEALTHY_MS,
    );

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [refresh, degraded]);

  return (
    <ProctorContext.Provider value={state}>{children}</ProctorContext.Provider>
  );
}

/**
 * Combines the two vantage points, which fail in opposite directions.
 *
 * The server knows whether it will accept a submission but is unreachable exactly
 * when the network drops. The agent's loopback report needs no network at all and
 * knows whether its own heartbeats are landing. Trusting the server alone means a
 * contestant who unplugs sees a reassuring green pill while their submissions are
 * in fact locked — the one moment the indicator has to be right.
 */
function resolve(
  self: ProctorSelfStatus | null,
  local: AgentLocalStatus | null,
): Omit<ProctorState, "resolved"> {
  const serverReachable = self !== null;
  const base = {
    exempt: self?.exempt ?? false,
    secondsSincePing: self?.seconds_since_ping ?? local?.seconds_since_ack ?? 0,
    local,
    attestNonce: local?.attest_nonce ?? null,
    serverReachable,
    starting: local?.starting ?? false,
  };

  if (self?.exempt) {
    return { ...base, submissionsAllowed: true };
  }

  if (local && !local.enrolled) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "AGENT_MISSING",
      remedy:
        "The proctor client is not enrolled on this machine. Open it and sign in once.",
    };
  }

  if (local?.revoked) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "ENROLLMENT_REVOKED",
      remedy:
        "This machine's proctor enrolment was revoked. Re-enrol it from the tray, or ask an organizer.",
    };
  }

  // Launched but not yet acknowledged. Submissions really are locked until the
  // first report lands, but blaming the contestant's network here is simply wrong —
  // and it is the state every single client passes through on startup.
  if (local?.starting) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "AGENT_STARTING",
      remedy:
        "The proctor client is starting up. This clears on its own within a few seconds.",
    };
  }

  // The agent is running and can be reached over loopback, but its heartbeats are
  // not landing — a dropped network, or the contest server being down.
  if (local && !local.healthy) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "AGENT_UNREACHABLE",
      remedy: local.buffered
        ? `The proctor client cannot reach the contest server and is holding ${local.buffered} report${local.buffered === 1 ? "" : "s"}. Check your network connection.`
        : "The proctor client cannot reach the contest server. Check your network connection.",
    };
  }

  if (!serverReachable) {
    // Both vantage points are dark. Don't cry wolf over one failed poll; the
    // server refuses the submission itself if it really is locked.
    return { ...base, submissionsAllowed: true };
  }

  return {
    ...base,
    submissionsAllowed: self.allowed,
    code: self.code,
    remedy: self.remedy,
  };
}

export function useProctor() {
  return useContext(ProctorContext);
}
