"use client";

import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

export function DesktopWindowControls() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const hasTauri =
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window ||
        "__TAURI__" in window ||
        Boolean(
          (window as unknown as { __MINIALGOTHON_DESKTOP__?: boolean })
            .__MINIALGOTHON_DESKTOP__,
        ));

    const isMac =
      (window as unknown as { __MINIALGOTHON_OS__?: string })
        .__MINIALGOTHON_OS__ === "macos" ||
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform);

    if (isMac) {
      // macOS uses native top-left traffic lights via TitleBarStyle::Overlay
      return;
    }

    setIsDesktop(true);

    const checkMaximized = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch {
        // Standalone or browser fallback
      }
    };

    void checkMaximized();
    window.addEventListener("resize", checkMaximized);
    return () => window.removeEventListener("resize", checkMaximized);
  }, []);

  if (!isDesktop) return null;

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("minimize_window");
      } catch {
        // Fallback
      }
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
      const maximized = await getCurrentWindow().isMaximized();
      setIsMaximized(maximized);
    } catch {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_maximize_window");
        setIsMaximized((prev) => !prev);
      } catch {
        // Fallback
      }
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("close_window");
      } catch {
        // Fallback
      }
    }
  };

  return (
    <div className="flex items-center gap-1 border-l-2 border-black pl-3 ml-0.5 select-none shrink-0">
      <button
        type="button"
        onClick={handleMinimize}
        title="Minimize"
        aria-label="Minimize window"
        className="flex h-7 w-7 items-center justify-center pixel-flat bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
      </button>

      <button
        type="button"
        onClick={handleToggleMaximize}
        title={isMaximized ? "Restore" : "Maximize"}
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        className="flex h-7 w-7 items-center justify-center pixel-flat bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {isMaximized ? (
          <Copy className="h-3 w-3" />
        ) : (
          <Square className="h-3 w-3 stroke-[2.5]" />
        )}
      </button>

      <button
        type="button"
        onClick={handleClose}
        title="Close window (minimizes to tray)"
        aria-label="Close window"
        className="flex h-7 w-7 items-center justify-center pixel-flat bg-card hover:bg-destructive hover:text-white text-muted-foreground transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5 stroke-[2.5]" />
      </button>
    </div>
  );
}
