"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "controlhub.sidebar.collapsed";

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return { collapsed, toggle, hydrated: true };
}
