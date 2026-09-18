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
