import { API_URL, SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Same-origin proxy for the live submission feed. The browser opens it at a relative
 * path because the session cookie belongs to this origin, not the API's. On the
 * contest LAN nginx owns that path and this never runs.
 *
 * A hosted function has a bounded lifetime, so the stream ends when the platform says
 * so; EventSource reconnects, and the poller in submissions-context is the backstop.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const session = readCookie(
    request.headers.get("cookie") ?? "",
    SESSION_COOKIE,
  );
  if (!session) {
    return new Response("unauthenticated", { status: 401 });
  }

  const headers = new Headers({
    Cookie: `${SESSION_COOKIE}=${session}`,
    Authorization: `Bearer ${session}`,
    Accept: "text/event-stream",
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/submissions/stream`, {
      headers,
      cache: "no-store",
      // Closes the upstream subscription when the contestant closes the page.
      signal: request.signal,
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("upstream unavailable", {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }
  return null;
}
