"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ChallengeThemeMode = "pixel" | "dark" | "light";

type ChallengeThemeContextType = {
  mode: ChallengeThemeMode;
  setMode: (mode: ChallengeThemeMode) => void;
};

const ChallengeThemeContext = createContext<ChallengeThemeContextType>({
  mode: "pixel",
  setMode: () => {},
});

const STORAGE_KEY = "minialgothon_challenge_theme";

export function ChallengeThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ChallengeThemeMode>("pixel");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ChallengeThemeMode | null;
    if (saved && (saved === "pixel" || saved === "dark" || saved === "light")) {
      setModeState(saved);
    }
  }, []);

  const setMode = (newMode: ChallengeThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <ChallengeThemeContext.Provider value={{ mode, setMode }}>
      <div
        className={`h-full w-full ${
          mode === "dark"
            ? "challenge-mode-dark"
            : mode === "light"
            ? "challenge-mode-light"
            : "challenge-mode-pixel"
        }`}
      >
        {children}
      </div>
    </ChallengeThemeContext.Provider>
  );
}

export function useChallengeTheme() {
  return useContext(ChallengeThemeContext);
}
