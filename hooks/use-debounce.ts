import { useEffect, useMemo, useRef } from "react";

export function useDebounceCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T & { cancel: () => void } {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const debounced = useMemo(() => {
    const fn = ((...args: Parameters<T>) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }) as T & { cancel: () => void };
    fn.cancel = () => clearTimeout(timeoutRef.current);
    return fn;
  }, [delay]);

  return debounced;
}
