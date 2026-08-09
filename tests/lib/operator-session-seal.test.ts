// input: @/lib/operator-session/seal, @/lib/operator-session/config, node:crypto
// output: Vitest tests for Operator Session sealing (AES-256-GCM, key rotation, fixed eight-hour age)
// pos: unit-level contract tests for the sealed-session cookie primitive used by the Console BFF
// note: if this file changes, update header and tests/lib/README.md
import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { sealSession, unsealSession } from "@/lib/operator-session/seal";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/operator-session/constants";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const PREVIOUS_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";

function makeConfig(overrides: Record<string, string> = {}) {
  const result = loadOperatorSessionConfig({
    CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_HEX,
    CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:3100",
    CONTROLHUB_BFF_SECURE_COOKIES: "false",
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(`invalid test config: ${result.problems.join(", ")}`);
  }
  return result.value;
}

const NOW_MS = 1_752_000_000_000;

describe("sealSession / unsealSession", () => {
  it("round-trips a payload with a fixed eight-hour maximum age", () => {
    const config = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      config,
      NOW_MS,
    );
    const result = unsealSession(sealed, config, NOW_MS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({
      token: "server-token-123",
      role: "admin",
      iat: NOW_MS / 1000,
      exp: NOW_MS / 1000 + SESSION_MAX_AGE_SECONDS,
    });
    expect(result.payload.exp - result.payload.iat).toBe(
      SESSION_MAX_AGE_SECONDS,
    );
  });

  it("produces an opaque cookie value that never contains plaintext credentials", () => {
    const config = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      config,
      NOW_MS,
    );
    expect(sealed).not.toContain("server-token-123");
    expect(sealed).not.toContain("token");
    expect(sealed).not.toContain("admin");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.split(".")).toHaveLength(5);
  });

  it("accepts a session sealed with the previous key during the rotation window", () => {
    const before = makeConfig(); // active key only
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      before,
      NOW_MS,
    );
    const after = makeConfig({
      CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: PREVIOUS_KEY_HEX,
    });
    const result = unsealSession(sealed, after, NOW_MS);
    expect(result.ok).toBe(true);
  });

  it("rejects previous-key seals once the previous-key window has closed", () => {
    const before = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      before,
      NOW_MS,
    );
    const rotated = makeConfig({
      CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: PREVIOUS_KEY_HEX,
    });
    const rotatedSealed = sealSession(
      { token: "server-token-456", role: "admin" },
      rotated,
      NOW_MS,
    );
    // Active key rotates: old active becomes previous, previous is dropped.
    const windowClosed = makeConfig({
      CONTROLHUB_BFF_SESSION_KEY: PREVIOUS_KEY_HEX,
    });
    expect(unsealSession(rotatedSealed, windowClosed, NOW_MS).ok).toBe(false);
    expect(unsealSession(sealed, windowClosed, NOW_MS).ok).toBe(false);
  });

  it("rejects an expired session at exactly eight hours", () => {
    const config = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      config,
      NOW_MS,
    );
    const expMs = NOW_MS + SESSION_MAX_AGE_SECONDS * 1000;
    expect(unsealSession(sealed, config, expMs - 1000).ok).toBe(true);
    const expired = unsealSession(sealed, config, expMs);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("expired");
  });

  it("rejects tampered ciphertext", () => {
    const config = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      config,
      NOW_MS,
    );
    const parts = sealed.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    const result = unsealSession(parts.join("."), config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tampered");
  });

  it("rejects malformed cookie values", () => {
    const config = makeConfig();
    for (const bad of ["", "garbage", "v1.abc", "v2.a.b.c.d.e"]) {
      const result = unsealSession(bad, config, NOW_MS);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("malformed");
    }
  });

  it("rejects seals made with an unknown key", () => {
    const config = makeConfig();
    const other = makeConfig({
      CONTROLHUB_BFF_SESSION_KEY: PREVIOUS_KEY_HEX,
    });
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      other,
      NOW_MS,
    );
    const result = unsealSession(sealed, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown-key");
  });

  it("rejects a sealed payload whose age is not exactly eight hours", () => {
    const config = makeConfig();
    const iat = NOW_MS / 1000;
    const exp = iat + SESSION_MAX_AGE_SECONDS + 1;
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", config.activeKey, nonce);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ token: "t", role: "r", iat, exp }), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const forged = [
      "v1",
      sealedKid(config.activeKey),
      nonce.toString("base64url"),
      encrypted.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
    const result = unsealSession(forged, config, NOW_MS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects a payload issued in the future", () => {
    const config = makeConfig();
    const sealed = sealSession(
      { token: "server-token-123", role: "admin" },
      config,
      NOW_MS,
    );
    const result = unsealSession(sealed, config, NOW_MS - 60_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });
});

function sealedKid(key: Buffer): string {
  // Mirror the seal prefix (key id) without importing internals: derive the
  // same sha256 prefix used by the seal format.
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
