// input: @/lib/operator-session/config
// output: Vitest tests for fail-closed Operator Session BFF configuration validation
// pos: unit-level contract tests for BFF configuration (sealing keys, Console Origin, secure-cookie policy)
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import { loadOperatorSessionConfig } from "@/lib/operator-session/config";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const PREVIOUS_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
const ACTIVE_KEY_BASE64 = Buffer.from(ACTIVE_KEY_HEX, "hex").toString("base64");
const PREVIOUS_KEY_BASE64 = Buffer.from(PREVIOUS_KEY_HEX, "hex").toString("base64");
const LOCAL_ORIGIN = "http://localhost:3100";
const HTTPS_ORIGIN = "https://console.example.com";

function env(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_BASE64,
    CONTROLHUB_BFF_CONSOLE_ORIGIN: LOCAL_ORIGIN,
    CONTROLHUB_BFF_SECURE_COOKIES: "false",
    ...overrides,
  };
}

describe("loadOperatorSessionConfig", () => {
  it("accepts a valid local development configuration", () => {
    const result = loadOperatorSessionConfig(env());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activeKey.length).toBe(32);
    expect(result.value.previousKey).toBeNull();
    expect(result.value.consoleOrigin).toBe("http://localhost:3100");
    expect(result.value.secureCookies).toBe(false);
  });

  it("accepts a valid production HTTPS configuration", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: HTTPS_ORIGIN,
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consoleOrigin).toBe(HTTPS_ORIGIN);
    expect(result.value.secureCookies).toBe(true);
  });

  it("accepts base64-encoded key material", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_BASE64 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activeKey.toString("hex")).toBe(ACTIVE_KEY_HEX);
  });

  it("rejects hex-encoded key material (base64 only)", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_HEX }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed when the active session key is missing", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: "" }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed for malformed active key material", () => {
    for (const bad of [
      "short",
      "zz".repeat(32),
      "00".repeat(31),
      "00".repeat(33),
    ]) {
      const result = loadOperatorSessionConfig(
        env({ CONTROLHUB_BFF_SESSION_KEY: bad }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("fails closed for an unsafe low-entropy active key", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: "00".repeat(32) }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed for a two-byte alternating (low-diversity) key", () => {
    // 01 02 repeated 16 times = 32 bytes, 2 unique values
    const twoByteCycle = Buffer.from(
      Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 0x01 : 0x02)),
    );
    const b64 = twoByteCycle.toString("base64");
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: b64 }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed when the previous key equals the active key", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: ACTIVE_KEY_BASE64 }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a distinct previous key for the rotation window", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: PREVIOUS_KEY_BASE64 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previousKey).not.toBeNull();
  });

  it("rejects hex-encoded previous key material (base64 only)", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: PREVIOUS_KEY_HEX }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed when the Console Origin is missing or unsafe", () => {
    expect(
      loadOperatorSessionConfig(env({ CONTROLHUB_BFF_CONSOLE_ORIGIN: "" })).ok,
    ).toBe(false);
    for (const bad of [
      "not-a-url",
      "ftp://localhost:3100",
      "http://",
      "http://localhost:3100/path",
      "http://user:pass@localhost:3100",
      "null",
      "http://localhost:3100?x=1",
    ]) {
      const result = loadOperatorSessionConfig(
        env({ CONTROLHUB_BFF_CONSOLE_ORIGIN: bad }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects HTTP origin in production (HTTPS required)", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:3100",
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts HTTP origin only in non-production (local development)", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:3100" }),
    );
    expect(result.ok).toBe(true);
  });

  it("normalizes a trailing slash on the Console Origin", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:3100/" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consoleOrigin).toBe("http://localhost:3100");
  });

  it("defaults secure cookies to true", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SECURE_COOKIES: "" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secureCookies).toBe(true);
  });

  it("fails closed for an invalid secure-cookie policy value", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SECURE_COOKIES: "maybe" }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails closed when production requests insecure cookies", () => {
    const result = loadOperatorSessionConfig(
      env({ NODE_ENV: "production", CONTROLHUB_BFF_SECURE_COOKIES: "false" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts secure cookies in production", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: HTTPS_ORIGIN,
        NODE_ENV: "production",
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
      }),
    );
    expect(result.ok).toBe(true);
  });

  // --- Issue #23: production HTTPS-origin enforcement ---

  it("rejects HTTP origin in production with insecure-cookies-in-production", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:3100",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects multiple origins (comma-separated)", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN:
          "https://a.example.com,https://b.example.com",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects origin with explicit port 80 in production", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: "http://localhost:80",
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects origin with path segments in production", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: "https://console.example.com/app",
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects origin with fragment in production", () => {
    const result = loadOperatorSessionConfig(
      env({
        CONTROLHUB_BFF_CONSOLE_ORIGIN: "https://console.example.com#section",
        CONTROLHUB_BFF_SECURE_COOKIES: "true",
        NODE_ENV: "production",
      }),
    );
    expect(result.ok).toBe(false);
  });
});
