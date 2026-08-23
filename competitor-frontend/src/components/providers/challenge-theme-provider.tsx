"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

export type ChallengeThemeMode = "pixel" | "dark" | "light";

type ChallengeThemeContextType = {
  mode: ChallengeThemeMode;
  setMode: (mode: ChallengeThemeMode) => void;
};

const STORAGE_KEY = "minialgothon_challenge_theme";
const DEFAULT_MODE: ChallengeThemeMode = "pixel";

const MODE_CLASS: Record<ChallengeThemeMode, string> = {
  pixel: "challenge-mode-pixel",
  dark: "challenge-mode-dark",
  light: "challenge-mode-light",
};

const ChallengeThemeContext = createContext<ChallengeThemeContextType>({
  mode: DEFAULT_MODE,
  setMode: () => {},
});

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function readMode(): ChallengeThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pixel" || saved === "dark" || saved === "light") {
      return saved;
    }
  } catch {
    // Private mode and blocked storage both throw on read.
  }
  return DEFAULT_MODE;
}

function serverMode(): ChallengeThemeMode {
  return DEFAULT_MODE;
}

function writeMode(mode: ChallengeThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The choice still applies for this session.
  }
  listeners.forEach((notify) => notify());
}

export function ChallengeThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, readMode, serverMode);
  const value = useMemo(() => ({ mode, setMode: writeMode }), [mode]);

  return (
    <ChallengeThemeContext.Provider value={value}>
      <div className={`h-full w-full ${MODE_CLASS[mode]}`}>{children}</div>
    </ChallengeThemeContext.Provider>
  );
}

export function useChallengeTheme() {
  return useContext(ChallengeThemeContext);
}
