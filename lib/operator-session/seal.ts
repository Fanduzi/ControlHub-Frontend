// input: node:crypto, @/lib/operator-session/config, @/lib/operator-session/constants
// output: sealed Operator Session cookie values (AES-256-GCM, active + previous key, fixed eight-hour age)
// pos: authenticated-encryption primitive for the Sealed Operator Session cookie
// note: if this file changes, update header and lib/operator-session/README.md
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { OperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/operator-session/constants";

export interface SealedSessionPayload {
  token: string;
  role: string;
  iat: number;
  exp: number;
}

export type UnsealResult =
  | { ok: true; payload: SealedSessionPayload }
  | { ok: false; reason: "malformed" | "unknown-key" | "tampered" | "expired" };

const SEAL_VERSION = "v1";

/**
 * Key id: a short non-secret fingerprint that lets the unsealer select the
 * active or previous key. The previous-key rotation window is controlled by
 * configuration: the previous key remains accepted only while
 * CONTROLHUB_BFF_PREVIOUS_SESSION_KEY is still configured.
 */
function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * Seal a session payload into an opaque cookie value:
 * `v1.<keyId>.<nonce>.<ciphertext>.<authTag>` (base64url).
 * The maximum session age is fixed at eight hours from issuance.
 */
export function sealSession(
  session: { token: string; role: string },
  config: OperatorSessionConfig,
  nowMs: number = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + SESSION_MAX_AGE_SECONDS;
  const plaintext = JSON.stringify({
    token: session.token,
    role: session.role,
    iat,
    exp,
  });
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.activeKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEAL_VERSION,
    keyId(config.activeKey),
    nonce.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Unseal and verify a session cookie value. Every failure is classified so
 * callers can map all authentication failures to one generic outcome without
 * ever distinguishing missing, malformed, tampered, or expired sessions.
 */
export function unsealSession(
  value: string,
  config: OperatorSessionConfig,
  nowMs: number = Date.now(),
): UnsealResult {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== SEAL_VERSION) {
    return { ok: false, reason: "malformed" };
  }

  const [, kid, noncePart, dataPart, tagPart] = parts;
  let key: Buffer | null = null;
  if (kid === keyId(config.activeKey)) {
    key = config.activeKey;
  } else if (config.previousKey && kid === keyId(config.previousKey)) {
    key = config.previousKey;
  }
  if (!key) return { ok: false, reason: "unknown-key" };

  let nonce: Buffer;
  let encrypted: Buffer;
  let tag: Buffer;
  try {
    nonce = Buffer.from(noncePart, "base64url");
    encrypted = Buffer.from(dataPart, "base64url");
    tag = Buffer.from(tagPart, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (nonce.length !== 12 || tag.length !== 16) {
    return { ok: false, reason: "malformed" };
  }

  let plaintext: string;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return { ok: false, reason: "tampered" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload !== "object" || payload === null) {
    return { ok: false, reason: "malformed" };
  }
  const { token, role, iat, exp } = payload as Record<string, unknown>;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    typeof role !== "string" ||
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    !Number.isInteger(iat) ||
    !Number.isInteger(exp)
  ) {
    return { ok: false, reason: "malformed" };
  }

  // The maximum session age is fixed: reject any sealed payload that claims
  // a longer lifetime, even if the authenticated encryption would accept it.
  if (exp - iat !== SESSION_MAX_AGE_SECONDS) {
    return { ok: false, reason: "malformed" };
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec >= exp) return { ok: false, reason: "expired" };
  if (nowSec < iat) return { ok: false, reason: "malformed" };

  return { ok: true, payload: { token, role, iat, exp } };
}
