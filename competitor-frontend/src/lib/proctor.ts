import { AGENT_HOST, LOOPBACK_PORTS, PROBE_TIMEOUT_MS } from "@/lib/constants";
import type { AgentLocalStatus, ProctorSelfStatus } from "@/types/proctor";

export { LOOPBACK_PORTS };

export function proctorLocksContest(self: ProctorSelfStatus | null): boolean {
  if (!self || self.exempt) return false;
  return !self.allowed;
}

function agentUrl(port: number, path: string): string {
  return `http://${AGENT_HOST}:${port}${path}`;
}

export async function readLocalAgent(
  preferredPort?: number,
): Promise<AgentLocalStatus | null> {
  for (const port of orderedPorts(preferredPort)) {
    const status = await probe(port);
    if (status) return status;
  }
  return null;
}

export async function stopLocalAgent(preferredPort?: number): Promise<boolean> {
  for (const port of orderedPorts(preferredPort)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(agentUrl(port, "/stop"), {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.ok) return true;
    } catch {
      // Ignore unreachable ports
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

function orderedPorts(preferredPort?: number): number[] {
  return preferredPort
    ? [
        preferredPort,
        ...LOOPBACK_PORTS.filter((port) => port !== preferredPort),
      ]
    : [...LOOPBACK_PORTS];
}

async function probe(port: number): Promise<AgentLocalStatus | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(agentUrl(port, "/status"), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentLocalStatus;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
