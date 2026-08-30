// input: Vitest fake timers, React hook rendering, and useDebounceCallback
// output: pending debounced callbacks are cancelled when their owner unmounts
// pos: shared debounce lifecycle regression contract
// note: if this file changes, update this header and tests/README.md
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDebounceCallback } from "@/hooks/use-debounce";

describe("useDebounceCallback", () => {
  afterEach(() => vi.useRealTimers());

  it("cancels a pending callback when its owner unmounts", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebounceCallback(callback, 300));

    act(() => result.current("orders"));
    unmount();
    act(() => vi.advanceTimersByTime(300));

    expect(callback).not.toHaveBeenCalled();
  });
});
