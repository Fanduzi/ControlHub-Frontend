// input: none
// output: same-origin guard for the Console BFF (unsafe methods require the exact configured Origin)
// pos: CSRF-boundary check for BFF session and proxy routes
// note: if this file changes, update header and lib/operator-session/README.md

/** Methods without side effects that are not gated on the Origin header. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method);
}

/**
 * True only when the request Origin matches the single configured Console
 * Origin exactly. Requests without an Origin header are never allowed for
 * unsafe methods.
 */
export function originAllowed(
  request: Request,
  consoleOrigin: string,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === consoleOrigin;
}
