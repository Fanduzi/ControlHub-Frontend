import { loadOperatorSessionConfig } from "@/lib/operator-session/config";

export function register(): void {
  if (process.env.NODE_ENV !== "production") return;
  // next build runs this in a separate process; the fail-closed gate applies
  // to production startup (next start), not to building the bundle.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const result = loadOperatorSessionConfig();
  if (!result.ok) {
    // Problem labels name environment variables only; no key material,
    // origin, or credential is included in the diagnostic.
    throw new Error(
      `[operator-session] production startup failed closed: invalid BFF configuration (${result.problems.join(", ")})`,
    );
  }
}
