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
const ORIGIN = "http://localhost:3100";

function env(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_HEX,
    CONTROLHUB_BFF_CONSOLE_ORIGIN: ORIGIN,
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

  it("accepts base64-encoded key material", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_SESSION_KEY: ACTIVE_KEY_BASE64 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activeKey.toString("hex")).toBe(ACTIVE_KEY_HEX);
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

  it("fails closed when the previous key equals the active key", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: ACTIVE_KEY_HEX }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a distinct previous key for the rotation window", () => {
    const result = loadOperatorSessionConfig(
      env({ CONTROLHUB_BFF_PREVIOUS_SESSION_KEY: PREVIOUS_KEY_HEX }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previousKey).not.toBeNull();
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
      env({ NODE_ENV: "production", CONTROLHUB_BFF_SECURE_COOKIES: "true" }),
    );
    expect(result.ok).toBe(true);
  });
});
