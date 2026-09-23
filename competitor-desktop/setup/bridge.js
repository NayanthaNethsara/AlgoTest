(function () {
  function getRawInvoke() {
    return (
      window.__TAURI_INTERNALS__?.invoke ||
      window.__TAURI__?.core?.invoke ||
      window.__TAURI__?.invoke
    );
  }

  window.appInvoke = async function (cmd, args) {
    let fn = getRawInvoke();
    if (typeof fn !== "function") {
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        fn = getRawInvoke();
        if (typeof fn === "function") break;
      }
    }
    if (typeof fn !== "function") {
      throw new Error("Desktop bridge unavailable. Please reload or restart the application.");
    }
    return fn(cmd, args);
  };
})();
