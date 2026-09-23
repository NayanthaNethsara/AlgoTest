"use client";

import { useChallengeTheme } from "@/components/problem/challenge-theme-provider";
import { Moon, Sun } from "lucide-react";

export function ChallengeThemeSwitcher() {
  const { mode, setMode } = useChallengeTheme();

  return (
    <div className="flex items-center gap-1 pixel-flat bg-card p-1 font-mono">
      <button
        type="button"
        onClick={() => setMode("dark")}
        title="Dark Mode"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${
          mode === "dark"
            ? "bg-primary font-semibold text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span>Dark</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("light")}
        title="Light Mode"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${
          mode === "light"
            ? "bg-primary font-semibold text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        <span>Light</span>
      </button>
    </div>
  );
}
