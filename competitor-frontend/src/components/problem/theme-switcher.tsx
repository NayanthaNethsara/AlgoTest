"use client";

import { useChallengeTheme } from "@/components/providers/challenge-theme-provider";
import { Gamepad2, Moon, Sun } from "lucide-react";

export function ChallengeThemeSwitcher() {
  const { mode, setMode } = useChallengeTheme();

  return (
    <div className="flex items-center gap-1 border-2 border-black bg-card p-1 shadow-[inset_1.5px_1.5px_0px_var(--bevel-light),inset_-1.5px_-1.5px_0px_var(--bevel-dark)]">
      <button
        type="button"
        onClick={() => setMode("pixel")}
        title="Pixel Retro Mode"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-pixel-body uppercase transition-all ${
          mode === "pixel"
            ? "border-2 border-black bg-primary font-bold text-primary-foreground shadow-[inset_1px_1px_0px_rgba(255,255,255,0.4)]"
            : "border-2 border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        <Gamepad2 className="h-3.5 w-3.5" />
        <span>Pixel</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("dark")}
        title="Clean Dark Mode"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans transition-all ${
          mode === "dark"
            ? "border-2 border-black bg-slate-800 font-bold text-white shadow-[inset_1px_1px_0px_rgba(255,255,255,0.2)]"
            : "border-2 border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span>Dark</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("light")}
        title="Clean Light Mode"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans transition-all ${
          mode === "light"
            ? "border-2 border-slate-400 bg-white font-bold text-slate-900 shadow-sm"
            : "border-2 border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5 text-amber-500" />
        <span>Light</span>
      </button>
    </div>
  );
}
