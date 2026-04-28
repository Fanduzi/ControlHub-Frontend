import { afterEach, describe, expect, it, vi } from "vitest";

describe("api proxy CORS origin resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows localhost 3000 by default", async () => {
    const { resolveCorsOrigin } = await import("../e2e/api-proxy.mjs");
    expect(resolveCorsOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("allows localhost 3100 by default", async () => {
    const { resolveCorsOrigin } = await import("../e2e/api-proxy.mjs");
    expect(resolveCorsOrigin("http://localhost:3100")).toBe("http://localhost:3100");
  });

  it("rejects unknown origins", async () => {
    const { resolveCorsOrigin } = await import("../e2e/api-proxy.mjs");
    expect(resolveCorsOrigin("http://evil.localhost:3000")).toBeNull();
  });

  it("returns null when no origin provided", async () => {
    const { resolveCorsOrigin } = await import("../e2e/api-proxy.mjs");
    expect(resolveCorsOrigin(undefined)).toBeNull();
    expect(resolveCorsOrigin("")).toBeNull();
  });

  it("supports explicit allowed-origin env override", async () => {
    vi.stubEnv("PLAYWRIGHT_PROXY_ALLOWED_ORIGINS", "http://localhost:4000");
    const { resolveCorsOrigin } = await import("../e2e/api-proxy.mjs");
    expect(resolveCorsOrigin("http://localhost:4000")).toBe("http://localhost:4000");
    expect(resolveCorsOrigin("http://localhost:3000")).toBeNull();
  });
});
