// Resolves the Tauri invoke bridge for these plain-HTML pages.
//
// `window.__TAURI__` only exists when `app.withGlobalTauri` is true, and
// `__TAURI_INTERNALS__` is always injected — so try both rather than depending on
// one config flag. If neither is present the page says so instead of sitting there
// looking blank, which is the failure mode this file exists to prevent.
(function () {
  const bridge = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;

  if (typeof bridge !== "function") {
    window.addEventListener("DOMContentLoaded", function () {
      const notice = document.createElement("div");
      notice.className = "notice error";
      notice.textContent =
        "This window could not reach the proctor client running on this machine. " +
        "Quit the app from the tray icon and start it again; if it keeps happening, tell an organizer.";
      document.body.prepend(notice);
    });
    window.appInvoke = function () {
      return Promise.reject(new Error("desktop bridge unavailable"));
    };
    return;
  }

  window.appInvoke = bridge;
})();
