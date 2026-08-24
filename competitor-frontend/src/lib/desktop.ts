/**
 * Whether the portal is being viewed inside the desktop client.
 *
 * The client cannot simply tell the page over an IPC bridge: it loads the portal
 * as a remote origin, and remote origins are deliberately granted no Tauri
 * commands. What it can control is the URL it opens, so it opens the portal with
 * `?client=desktop` and the proxy turns that single request into a cookie — the
 * query itself does not survive the first redirect, and a cookie survives every
 * navigation after it.
 *
 * The cookie is scoped to the client's own webview data store, so a contestant's
 * browser never sees it even on the same machine.
 */
export const DESKTOP_CLIENT_COOKIE = "mini-algothon-client";

export const DESKTOP_CLIENT_VALUE = "desktop";

/**
 * Header the portal's server side uses to pass the marker on to the API, which
 * needs it to tell "working in the client" from "working in a browser while the
 * client runs" — two access modes an organizer grants separately.
 *
 * The API treats it as a claim, not proof: the cookie above is readable, so a
 * browser can be made to send it. It is believed only where the agent independently
 * reports its shell process alive, which means forging it requires running the
 * desktop client, and therefore being proctored, anyway.
 */
export const CLIENT_HEADER = "X-Proctor-Client";

export const WEB_CLIENT_VALUE = "web";

export function isDesktopClient(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie
    .split(";")
    .some(
      (entry) =>
        entry.trim() === `${DESKTOP_CLIENT_COOKIE}=${DESKTOP_CLIENT_VALUE}`,
    );
}

export function ensureDesktopClientCookie(): void {
  if (typeof window === "undefined") return;
  const isClientDesktop =
    new URLSearchParams(window.location.search).get("client") === DESKTOP_CLIENT_VALUE;
  if (isClientDesktop) {
    document.cookie = `${DESKTOP_CLIENT_COOKIE}=${DESKTOP_CLIENT_VALUE}; path=/; max-age=2592000; SameSite=Lax`;
  }
}

