"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  applyAccentToDocument,
  readStoredAccent,
  type AccentName,
} from "@/lib/preferences";

type AccentContextValue = {
  accent: AccentName;
  setAccent: (accent: AccentName) => void;
};

const AccentContext = createContext<AccentContextValue | null>(null);
const emptySubscribe = () => () => {};

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentName>(DEFAULT_ACCENT);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const currentAccent = mounted ? readStoredAccent() : accent;

  useEffect(() => {
    applyAccentToDocument(currentAccent);
  }, [currentAccent]);

  function setAccent(nextAccent: AccentName) {
    applyAccentToDocument(nextAccent);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, nextAccent);
    setAccentState(nextAccent);
  }

  return (
    <AccentContext.Provider value={{ accent: currentAccent, setAccent }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  const context = useContext(AccentContext);

  if (!context) {
    throw new Error("useAccent must be used within an AccentProvider");
  }

  return context;
}
