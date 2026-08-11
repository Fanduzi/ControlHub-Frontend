// input: vitest, e2e/harness/fixtures
// output: unit tests for the E2E fixture identity resolver — fail-loud when env is
// missing, explicit admin/editor identities, and hard refusal of the retired 0002
// seed accounts (no silent fallback)
// pos: locks the E2E credential contract: fixtures come only from controlled
// provisioning env; the published seed credentials can never be used or resumed
// note: if this file changes, update header and tests/e2e-harness/README.md
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveFixtureIdentity,
  FIXTURE_ENV,
} from "../../e2e/harness/fixtures";

function stubFixtureEnv(overrides: Partial<Record<string, string>> = {}) {
  const base: Record<string, string> = {
    [FIXTURE_ENV.admin.email]: "e2e-admin@controlhub-e2e.invalid",
    [FIXTURE_ENV.admin.password]: "admin-pw-123",
    [FIXTURE_ENV.editor.email]: "e2e-editor@controlhub-e2e.invalid",
    [FIXTURE_ENV.editor.password]: "editor-pw-456",
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveFixtureIdentity", () => {
  it("fails loud when the admin fixture env is missing", () => {
    stubFixtureEnv({ [FIXTURE_ENV.admin.email]: "" });
    expect(() => resolveFixtureIdentity("admin")).toThrow(/E2E_FIXTURE_ADMIN_EMAIL/);

    stubFixtureEnv({ [FIXTURE_ENV.admin.password]: "" });
    expect(() => resolveFixtureIdentity("admin")).toThrow(/E2E_FIXTURE_ADMIN_PASSWORD/);
  });

  it("fails loud when the editor fixture env is missing", () => {
    stubFixtureEnv({ [FIXTURE_ENV.editor.email]: "" });
    expect(() => resolveFixtureIdentity("editor")).toThrow(/E2E_FIXTURE_EDITOR_EMAIL/);

    stubFixtureEnv({ [FIXTURE_ENV.editor.password]: "" });
    expect(() => resolveFixtureIdentity("editor")).toThrow(/E2E_FIXTURE_EDITOR_PASSWORD/);
  });

  it("fails loud on blank (whitespace-only) fixture values", () => {
    stubFixtureEnv({ [FIXTURE_ENV.admin.password]: "   " });

    expect(() => resolveFixtureIdentity("admin")).toThrow(/E2E_FIXTURE_ADMIN_PASSWORD/);
  });

  it("refuses the retired seed admin account — no fallback, ever", () => {
    stubFixtureEnv({
      [FIXTURE_ENV.admin.email]: "admin@example.com",
      [FIXTURE_ENV.admin.password]: "some-password",
    });

    expect(() => resolveFixtureIdentity("admin")).toThrow(/refus|seed|example\.com/i);
  });

  it("refuses the retired seed editor account — no fallback, ever", () => {
    stubFixtureEnv({
      [FIXTURE_ENV.editor.email]: "editor@example.com",
      [FIXTURE_ENV.editor.password]: "some-password",
    });

    expect(() => resolveFixtureIdentity("editor")).toThrow(/refus|seed|example\.com/i);
  });

  it("refuses the retired seed password on either role", () => {
    stubFixtureEnv({
      [FIXTURE_ENV.admin.password]: "secret123",
      [FIXTURE_ENV.editor.password]: "secret123",
    });

    expect(() => resolveFixtureIdentity("admin")).toThrow(/refus|seed/i);
    expect(() => resolveFixtureIdentity("editor")).toThrow(/refus|seed/i);
  });

  it("returns the explicit admin and editor fixture identities from env", () => {
    stubFixtureEnv();

    expect(resolveFixtureIdentity("admin")).toEqual({
      email: "e2e-admin@controlhub-e2e.invalid",
      password: "admin-pw-123",
    });
    expect(resolveFixtureIdentity("editor")).toEqual({
      email: "e2e-editor@controlhub-e2e.invalid",
      password: "editor-pw-456",
    });
  });

  it("normalizes email case but preserves the password byte-for-byte", () => {
    stubFixtureEnv({
      [FIXTURE_ENV.admin.email]: "  E2E.Admin@ControlHub-E2E.Invalid  ",
      [FIXTURE_ENV.admin.password]: "MixedCase-Pw!",
    });

    expect(resolveFixtureIdentity("admin").email).toBe(
      "e2e.admin@controlhub-e2e.invalid",
    );
    expect(resolveFixtureIdentity("admin").password).toBe("MixedCase-Pw!");
  });
});
