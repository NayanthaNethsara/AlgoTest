"use client";

import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

function checkIsWindowsDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const hasDesktopCookie = document.cookie.includes(
    "mini-algothon-client=desktop",
  );
  const hasDesktopParam =
    new URLSearchParams(window.location.search).get("client") === "desktop";
  const hasDesktopGlobal = Boolean(
    (window as unknown as { __MINIALGOTHON_DESKTOP__?: boolean })
      .__MINIALGOTHON_DESKTOP__,
  );
  const isMac =
    (window as unknown as { __MINIALGOTHON_OS__?: string })
      .__MINIALGOTHON_OS__ === "macos" ||
    /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform);

  return Boolean((hasDesktopCookie || hasDesktopParam || hasDesktopGlobal) && !isMac);
}

export function DesktopWindowControls() {
  const [isWindowsDesktop] = useState(checkIsWindowsDesktop);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isWindowsDesktop) return;

    // Attach dragging listener for regions marked with data-window-drag-region
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const dragRegion = target.closest("[data-window-drag-region]");
      const isInteractive = target.closest(
        "button, a, input, select, textarea, [data-no-drag]",
      );

      if (dragRegion && !isInteractive && e.buttons === 1) {
        void fetch("http://127.0.0.1:47620/drag", {
          method: "POST",
          mode: "no-cors",
        }).catch(() => {});
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isWindowsDesktop]);

  if (!isWindowsDesktop) return null;

  const handleMinimize = () => {
    void fetch("http://127.0.0.1:47620/minimize", {
      method: "POST",
      mode: "no-cors",
    }).catch(() => {});
  };

  const handleToggleMaximize = () => {
    void fetch("http://127.0.0.1:47620/toggle-maximize", {
      method: "POST",
      mode: "no-cors",
    })
      .then(() => setIsMaximized((prev) => !prev))
      .catch(() => {});
  };

  const handleClose = () => {
    void fetch("http://127.0.0.1:47620/close", {
      method: "POST",
      mode: "no-cors",
    }).catch(() => {});
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
