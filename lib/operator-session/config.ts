// input: node:buffer, @/lib/operator-session/constants
// output: fail-closed Operator Session BFF configuration loader (sealing keys, Console Origin, secure-cookie policy)
// pos: validates BFF environment configuration before any session or proxy traffic is served
// note: if this file changes, update header and lib/operator-session/README.md
export interface OperatorSessionConfig {
  /** Active 32-byte AES-256-GCM sealing key. */
  activeKey: Buffer;
  /** Previous key accepted during the short rotation window; null when closed. */
  previousKey: Buffer | null;
  /** The single configured Console Origin, normalized (no trailing slash). */
  consoleOrigin: string;
  /** Secure-cookie policy; production never allows false. */
  secureCookies: boolean;
}

export type ConfigLoadResult =
  | { ok: true; value: OperatorSessionConfig }
  | { ok: false; problems: string[] };

/**
 * Reject key material whose content repeats at a period shorter than the
 * full key length. This catches single-byte, two-byte, four-byte, eight-byte,
 * and sixteen-byte repeating patterns (periods 1, 2, 4, 8, 16).
 *
 * This is a structural check — it rejects obvious repeating patterns — not
 * an entropy measurement. High-entropy random keys will always pass.
 */
function hasRepeatingPattern(buf: Buffer): boolean {
  for (let period = 1; period <= 16; period *= 2) {
    if (buf.length % period !== 0) continue;
    const slice = buf.subarray(0, period);
    let matches = true;
    for (let i = period; i < buf.length; i += period) {
      if (!buf.subarray(i, i + period).equals(slice)) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function decodeKeyMaterial(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) return null;

  // Sealing keys must be base64 and decode to exactly 32 bytes.
  // Hex encoding is rejected — base64 is the only accepted format.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;

  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) return null;
  // Reject low-diversity key material with a short repeating pattern.
  // This catches single-byte, two-byte, four-byte, eight-byte, and
  // sixteen-byte cycles. The check is structural, not an entropy proof.
  if (hasRepeatingPattern(bytes)) return null;
  return bytes;
}

function normalizeConsoleOrigin(
  raw: string,
  isProduction: boolean,
): string | null {
  const value = raw.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;

  // Production requires exactly one HTTPS Console Origin.
  // HTTP is accepted only as an explicit bounded local-development exception.
  if (isProduction && url.protocol !== "https:") return null;

  return `${url.protocol}//${url.host}`;
}

/**
 * Load and validate the Operator Session BFF configuration.
 *
 * Fail-closed: any missing, malformed, or unsafe value (or a production
 * non-Secure cookie policy) produces `{ ok: false, problems }` and no
 * configuration. Problem labels name environment variables only; they never
 * contain key material, origins, or credentials.
 */
export function loadOperatorSessionConfig(
  env: Record<string, string | undefined> = process.env,
): ConfigLoadResult {
  const problems: string[] = [];

  const activeKey = decodeKeyMaterial(env.CONTROLHUB_BFF_SESSION_KEY ?? "");
  if (!activeKey) {
    problems.push("invalid-or-missing-active-key");
  }

  const previousRaw = env.CONTROLHUB_BFF_PREVIOUS_SESSION_KEY;
  let previousKey: Buffer | null = null;
  if (previousRaw !== undefined && previousRaw.trim() !== "") {
    previousKey = decodeKeyMaterial(previousRaw);
    if (!previousKey) {
      problems.push("invalid-previous-key");
    } else if (activeKey && previousKey.equals(activeKey)) {
      problems.push("previous-key-equals-active-key");
    }
  }

  const isProduction = env.NODE_ENV === "production";
  const consoleOrigin = normalizeConsoleOrigin(
    env.CONTROLHUB_BFF_CONSOLE_ORIGIN ?? "",
    isProduction,
  );
  if (!consoleOrigin) {
    problems.push("invalid-or-missing-console-origin");
  }

  const rawPolicy = (env.CONTROLHUB_BFF_SECURE_COOKIES ?? "").trim();
  let secureCookies: boolean;
  if (rawPolicy === "" || rawPolicy === "true") {
    secureCookies = true;
  } else if (rawPolicy === "false") {
    secureCookies = false;
  } else {
    problems.push("invalid-secure-cookie-policy");
    secureCookies = true;
  }

  if (!secureCookies && env.NODE_ENV === "production") {
    problems.push("insecure-cookies-in-production");
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      activeKey: activeKey as Buffer,
      previousKey,
      consoleOrigin: consoleOrigin as string,
      secureCookies,
    },
  };
}
