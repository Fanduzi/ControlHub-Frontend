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

function decodeKeyMaterial(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) return null;

  let bytes: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    bytes = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    bytes = Buffer.from(value, "base64");
  }

  if (!bytes || bytes.length !== 32) return null;
  // Unsafe low-entropy key material (single repeated byte) is rejected.
  if (new Set(bytes).size < 2) return null;
  return bytes;
}

function normalizeConsoleOrigin(raw: string): string | null {
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

  const consoleOrigin = normalizeConsoleOrigin(
    env.CONTROLHUB_BFF_CONSOLE_ORIGIN ?? "",
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
