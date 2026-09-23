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
import type {
  AgentLocalStatus,
  LocalAccessState,
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

type ProctorContextValue = ProctorState & {
  localAccessState: LocalAccessState;
  requestLocalAccess: () => Promise<void>;
};

const ProctorContext = createContext<ProctorContextValue>({
  ...INITIAL_PROCTOR_STATE,
  localAccessState: "checking",
  requestLocalAccess: async () => {},
});

async function getLocalNetworkPermission(): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  try {
    return (
      await navigator.permissions.query({
        name: "local-network-access" as PermissionName,
      })
    ).state;
  } catch {
    // Browsers without the Local Network Access permission API can still use
    // loopback, so preserve the normal probe for them.
    return null;
  }
}

function seed(self: ProctorSelfStatus | null): ProctorState {
  if (!self) return INITIAL_PROCTOR_STATE;
  const localProofRequired =
    !self.exempt &&
    !(self.allowed && self.access_mode === "WEB_ONLY");
  const state = { ...resolve(self, null), resolved: !localProofRequired };
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
  const [localAccessState, setLocalAccessState] =
    useState<LocalAccessState>("checking");
  const knownPort = useRef<number | undefined>(undefined);
  const router = useRouter();

  const refresh = useCallback(async (exhaustive = false, requestAccess = false) => {
    const tabVisible =
      typeof document !== "undefined" ? !document.hidden : true;
    const self = await getProctorSelfAction(tabVisible);

    const needsLocalProbe =
      Boolean(self) &&
      !self?.exempt &&
      !(self?.allowed && self?.access_mode === "WEB_ONLY");

    let local: AgentLocalStatus | null = null;
    if (!needsLocalProbe) {
      setLocalAccessState("not-required");
    } else {
      const permission = await getLocalNetworkPermission();
      if (!requestAccess && permission === "prompt") {
        setLocalAccessState("prompt");
      } else if (!requestAccess && permission === "denied") {
        setLocalAccessState("denied");
      } else {
        local = await readLocalAgent(knownPort.current, exhaustive);
        const permissionAfterProbe = await getLocalNetworkPermission();
        setLocalAccessState(
          local
            ? "granted"
            : permissionAfterProbe === "denied"
              ? "denied"
              : "unavailable",
        );
      }
    }

    if (local?.loopback_port) {
      knownPort.current = local.loopback_port;
    } else if (self?.loopback_port) {
      knownPort.current = self.loopback_port;
    }

    setState({ ...resolve(self, local), resolved: true });
  }, []);

  const requestLocalAccess = useCallback(async () => {
    setLocalAccessState("requesting");
    await refresh(true, true);
  }, [refresh]);

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

  const lastTickTime = useRef<number>(0);
  const refreshInFlight = useRef(false);
  const pollDelay = useRef(POLL_HEALTHY_MS);
  const pollWhileHidden = useRef(false);
  useEffect(() => {
    pollDelay.current = degraded ? POLL_DEGRADED_MS : POLL_HEALTHY_MS;
    pollWhileHidden.current = degraded;
  }, [degraded]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (exhaustive = false) => {
      if (cancelled || refreshInFlight.current) return;
      if (
        typeof document !== "undefined" &&
        document.hidden &&
        !pollWhileHidden.current
      ) {
        timer = setTimeout(() => void tick(), pollDelay.current);
        return;
      }
      refreshInFlight.current = true;
      lastTickTime.current = Date.now();
      try {
        await refresh(exhaustive);
      } finally {
        refreshInFlight.current = false;
        if (!cancelled) {
          timer = setTimeout(() => void tick(), pollDelay.current);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && !cancelled) {
        if (Date.now() - lastTickTime.current >= 3000) {
          if (timer) clearTimeout(timer);
          void tick(true);
        }
      }
    };

    void tick(true);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [refresh]);

  return (
    <ProctorContext.Provider
      value={{ ...state, localAccessState, requestLocalAccess }}
    >
      {children}
    </ProctorContext.Provider>
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

  if (self?.allowed && self.access_mode === "WEB_ONLY") {
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

  if (!local && self.allowed && self.access_mode !== "WEB_ONLY") {
    return {
      ...base,
      submissionsAllowed: false,
      code: "NOT_ATTESTED",
      remedy:
        "This browser cannot verify the proctor client on the same computer. Open the contestant window from the proctor client, or start the client on this machine.",
    };
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
