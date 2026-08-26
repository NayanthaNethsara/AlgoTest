"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { THEME_STORAGE_KEY } from "@/lib/constants";
import type { ChallengeThemeMode } from "@/types/problem";

type ChallengeThemeContextType = {
  mode: ChallengeThemeMode;
  setMode: (mode: ChallengeThemeMode) => void;
};

const DEFAULT_MODE: ChallengeThemeMode = "dark";

const MODE_CLASS: Record<ChallengeThemeMode, string> = {
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
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
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
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Session fallback if storage is restricted
  }
  listeners.forEach((notify) => notify());
}

export function ChallengeThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const mode = useSyncExternalStore(subscribe, readMode, serverMode);
  const value = useMemo(() => ({ mode, setMode: writeMode }), [mode]);

  return (
    <ChallengeThemeContext.Provider value={value}>
      <div className={`h-full w-full bg-background text-foreground ${MODE_CLASS[mode]}`}>{children}</div>
    </ChallengeThemeContext.Provider>
  );
}

export function useChallengeTheme() {
  return useContext(ChallengeThemeContext);
}
