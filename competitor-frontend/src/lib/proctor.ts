import type { AgentLocalStatus } from "@/types/proctor";

/**
 * Ports the agent tries in order. The portal probes the same range, so a port
 * conflict on a contestant's machine costs a retry instead of a broken install.
 */
export const LOOPBACK_PORTS = [47615, 47616, 47617, 47618, 47619] as const;

const PROBE_TIMEOUT_MS = 700;

/**
 * Reads the agent's status over loopback.
 *
 * This is the same-machine proof: a page can only read the rotating nonce if the
 * agent is listening on this contestant's own machine. It is not proof the code
 * was written here — a determined contestant with two machines can relay the value
 * over the LAN — so its absence is a review signal, never a verdict.
 */
export async function readLocalAgent(preferredPort?: number): Promise<AgentLocalStatus | null> {
  const ports = preferredPort
    ? [preferredPort, ...LOOPBACK_PORTS.filter((port) => port !== preferredPort)]
    : [...LOOPBACK_PORTS];

  for (const port of ports) {
    const status = await probe(port);
    if (status) return status;
  }
  return null;
}

async function probe(port: number): Promise<AgentLocalStatus | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentLocalStatus;
  } catch {
    // An unreachable port is the normal case for four of the five.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
