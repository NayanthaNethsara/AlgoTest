"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getProctorSelfAction } from "@/actions/telemetry";
import { POLL_DEGRADED_MS, POLL_HEALTHY_MS } from "@/lib/constants";
import { readLocalAgent } from "@/lib/proctor";
import { isDesktopClient } from "@/lib/desktop";
import type {
  AgentLocalStatus,
  ProctorSelfStatus,
  ProctorState,
} from "@/types/proctor";

const INITIAL_PROCTOR_STATE: ProctorState = {
  submissionsAllowed: true,
  exempt: false,
  accessMode: null,
  allowedModes: [],
  secondsSincePing: 0,
  local: null,
  attestNonce: null,
  serverReachable: true,
  starting: false,
  resolved: false,
};

const ProctorContext = createContext<ProctorState>(INITIAL_PROCTOR_STATE);

function seed(self: ProctorSelfStatus | null): ProctorState {
  if (!self) return INITIAL_PROCTOR_STATE;
  const state = { ...resolve(self, null), resolved: true };
  if (state.code === "AGENT_MISSING") {
    state.remedy = self.remedy ?? state.remedy;
  }
  return state;
}

export function ProctorProvider({
  initialProctor = null,
  children,
}: {
  initialProctor?: ProctorSelfStatus | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ProctorState>(() => seed(initialProctor));
  const knownPort = useRef<number | undefined>(undefined);
  const router = useRouter();

  const refresh = useCallback(async (exhaustive = false) => {
    const tabVisible =
      typeof document !== "undefined" ? !document.hidden : true;

    const [self, local] = await Promise.all([
      getProctorSelfAction(tabVisible),
      readLocalAgent(knownPort.current, exhaustive),
    ]);

    if (local?.loopback_port) {
      knownPort.current = local.loopback_port;
    } else if (self?.loopback_port) {
      knownPort.current = self.loopback_port;
    }

    setState({ ...resolve(self, local), resolved: true });
  }, []);

  useEffect(() => {
    if (isDesktopClient()) {
      readLocalAgent(knownPort.current).then((local) => {
        if (local) {
          if (local.loopback_port) {
            knownPort.current = local.loopback_port;
          }
          setState((prev) => ({
            ...prev,
            local,
            submissionsAllowed: !(
              local.multiple_monitors_detected ||
              (local.monitor_count && local.monitor_count > 1)
            ),
          }));
        }
      });
    }
  }, []);

  const degraded =
    state.resolved && (!state.submissionsAllowed || state.starting);

  const locked = contestLocked(state);
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      router.refresh();
    }
    wasLocked.current = locked;
  }, [locked, router]);

  useEffect(() => {
    let cancelled = false;

    const tick = async (exhaustive = false) => {
      if (cancelled) return;
      await refresh(exhaustive);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && !cancelled) {
        void tick(true);
      }
    };

    void tick(true);
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
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [refresh, degraded]);

  return (
    <ProctorContext.Provider value={state}>{children}</ProctorContext.Provider>
  );
}

function resolve(
  self: ProctorSelfStatus | null,
  local: AgentLocalStatus | null,
): Omit<ProctorState, "resolved"> {
  const serverReachable = self !== null;
  const base = {
    exempt: self?.exempt ?? false,
    accessMode: self?.access_mode ?? null,
    allowedModes: self?.allowed_modes ?? [],
    secondsSincePing: self?.seconds_since_ping ?? local?.seconds_since_ack ?? 0,
    local,
    attestNonce: local?.attest_nonce ?? null,
    serverReachable,
    starting: local?.starting ?? false,
  };

  if (self?.exempt) {
    return { ...base, submissionsAllowed: true };
  }

  if (!local?.agent_only_mode && (local?.multiple_monitors_detected || (local?.monitor_count && local.monitor_count > 1))) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "MULTIPLE_DISPLAYS_DETECTED",
      remedy:
        "Multiple displays detected. Please unplug all secondary displays to continue the competition.",
    };
  }


  if (self?.allowed && self.allowed_modes?.includes("WEB_ONLY")) {
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
        "This machine's proctor enrolment was revoked. Re-enrol this machine or contact an organizer.",

    };
  }

  if (local?.starting) {
    return {
      ...base,
      submissionsAllowed: false,
      code: "AGENT_STARTING",
      remedy:
        "The proctor client is starting up. This clears on its own within a few seconds.",
    };
  }

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
    return { ...base, submissionsAllowed: true };
  }

  if (!local && !self.allowed && self.code === "AGENT_MISSING") {
    return {
      ...base,
      submissionsAllowed: false,
      code: self.code,
      remedy:
        "No proctor client has reported, and this page could not reach one on this machine. Open the client and sign in once — if it is already running, reload this page.",
    };
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

export function contestLocked(state: ProctorState): boolean {
  return state.resolved && !state.submissionsAllowed && !state.exempt;
}
