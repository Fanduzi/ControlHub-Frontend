// input: React lifecycle, callback, and debounce delay
// output: stable debounced callback that cancels pending work on owner unmount
// pos: shared client-side debounce lifecycle primitive
// note: if this file changes, update this header and hooks/README.md
import { useCallback, useEffect, useRef } from "react";

export function useDebounceCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;
}
