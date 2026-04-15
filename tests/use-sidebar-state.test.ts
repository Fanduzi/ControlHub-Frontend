import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock localStorage before importing the hook
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

import { useSidebarState } from "@/components/app-shell/use-sidebar-state";

describe("useSidebarState", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("defaults to expanded when no stored value", () => {
    const { result } = renderHook(() => useSidebarState());

    // After hydration
    expect(result.current.collapsed).toBe(false);
  });

  it("reads collapsed state from localStorage on mount", () => {
    // Populate store so getSnapshot returns consistent values across calls
    localStorageMock.setItem("controlhub.sidebar.collapsed", "true");

    const { result } = renderHook(() => useSidebarState());

    expect(result.current.collapsed).toBe(true);
  });

  it("toggles from expanded to collapsed", () => {
    const { result } = renderHook(() => useSidebarState());

    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.collapsed).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "controlhub.sidebar.collapsed",
      "true",
    );
  });

  it("toggles from collapsed to expanded", () => {
    localStorageMock.setItem("controlhub.sidebar.collapsed", "true");

    const { result } = renderHook(() => useSidebarState());

    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.collapsed).toBe(false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "controlhub.sidebar.collapsed",
      "false",
    );
  });

  it("persists collapsed state to localStorage on toggle", () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => {
      result.current.toggle();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "controlhub.sidebar.collapsed",
      "true",
    );
  });

  it("handles localStorage unavailable gracefully", () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error("localStorage not available");
    });
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error("localStorage not available");
    });

    const { result } = renderHook(() => useSidebarState());

    // Should default to expanded even when localStorage fails
    expect(result.current.collapsed).toBe(false);

    // Toggle should not throw
    act(() => {
      result.current.toggle();
    });

    expect(result.current.collapsed).toBe(true);
  });
});
