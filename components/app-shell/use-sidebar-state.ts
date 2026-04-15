"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "controlhub.sidebar.collapsed";
const listeners = new Set<() => void>();
let fallbackCollapsed = false;

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return fallbackCollapsed;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        listener();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", handleStorage);
    };
  }

  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

const emptySubscribe = () => () => {};

export function useSidebarState() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const toggle = useCallback(() => {
    const next = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      fallbackCollapsed = next;
    }
    emitChange();
  }, [collapsed]);

  return { collapsed, toggle, hydrated };
}
