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

export function isDesktopClient(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${DESKTOP_CLIENT_COOKIE}=${DESKTOP_CLIENT_VALUE}`);
}
