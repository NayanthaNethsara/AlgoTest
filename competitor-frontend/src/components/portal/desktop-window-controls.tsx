"use client";

import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

interface TauriWindowInstance {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  startDragging: () => Promise<void>;
}

async function getAppWindow(): Promise<TauriWindowInstance | null> {
  if (typeof window === "undefined") return null;

  try {
    const globalTauri = (
      window as unknown as {
        __TAURI__?: {
          window?: {
            getCurrentWindow?: () => TauriWindowInstance;
          };
        };
      }
    ).__TAURI__;

    if (typeof globalTauri?.window?.getCurrentWindow === "function") {
      return globalTauri.window.getCurrentWindow();
    }
  } catch {
    // Continue
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow() as unknown as TauriWindowInstance;
  } catch {
    // Continue
  }

  return null;
}

export function DesktopWindowControls() {
  const [isDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    const isClientDesktopParam =
      new URLSearchParams(window.location.search).get("client") === "desktop";
    const hasTauri =
      isClientDesktopParam ||
      "__TAURI_INTERNALS__" in window ||
      "__TAURI__" in window ||
      Boolean(
        (window as unknown as { __MINIALGOTHON_DESKTOP__?: boolean })
          .__MINIALGOTHON_DESKTOP__,
      );
    const isMac =
      (window as unknown as { __MINIALGOTHON_OS__?: string })
        .__MINIALGOTHON_OS__ === "macos" ||
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform);

    return Boolean(hasTauri && !isMac);
  });
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const checkMaximized = async () => {
      try {
        const appWindow = await getAppWindow();
        if (appWindow) {
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);
        }
      } catch {
        // Fallback
      }
    };

    const handleMouseDown = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const dragRegion = target.closest("[data-tauri-drag-region]");
      const isInteractive = target.closest(
        "button, a, input, select, textarea, [data-no-drag]",
      );
      if (dragRegion && !isInteractive && e.buttons === 1) {
        try {
          const appWindow = await getAppWindow();
          if (appWindow) {
            await appWindow.startDragging();
            return;
          }
        } catch {
          // Fallback
        }

        try {
          const internals = (
            window as unknown as {
              __TAURI_INTERNALS__?: {
                invoke: (cmd: string) => Promise<void>;
              };
            }
          ).__TAURI_INTERNALS__;
          if (internals?.invoke) {
            await internals.invoke("plugin:window|start_dragging");
          }
        } catch {
          // Ignore
        }
      }
    };

    void checkMaximized();
    window.addEventListener("resize", checkMaximized);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      window.removeEventListener("resize", checkMaximized);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  const handleMinimize = async () => {
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.minimize();
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string) => Promise<void>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        await internals.invoke("plugin:window|minimize");
        return;
      }
    } catch {
      // Fallback
    }

    try {
      await fetch("http://127.0.0.1:47620/minimize", {
        method: "POST",
        mode: "no-cors",
      });
    } catch {
      // Fallback
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.toggleMaximize();
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string) => Promise<void>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        await internals.invoke("plugin:window|toggle_maximize");
        setIsMaximized((prev) => !prev);
        return;
      }
    } catch {
      // Fallback
    }

    try {
      await fetch("http://127.0.0.1:47620/toggle-maximize", {
        method: "POST",
        mode: "no-cors",
      });
      setIsMaximized((prev) => !prev);
    } catch {
      // Fallback
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = await getAppWindow();
      if (appWindow) {
        await appWindow.close();
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string) => Promise<void>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        await internals.invoke("plugin:window|close");
        return;
      }
    } catch {
      // Fallback
    }

    try {
      await fetch("http://127.0.0.1:47620/close", {
        method: "POST",
        mode: "no-cors",
      });
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="flex items-center gap-1 border-l-2 border-black pl-3 ml-0.5 select-none shrink-0"
      data-no-drag
    >
      <button
        type="button"
        id="titlebar-minimize"
        onClick={handleMinimize}
        title="Minimize"
        aria-label="Minimize window"
        className="flex h-7 w-7 items-center justify-center pixel-flat bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
      </button>

      <button
        type="button"
        id="titlebar-maximize"
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
        id="titlebar-close"
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
