// input: node process env
// output: fail-loud resolver for E2E fixture operator identities (admin/editor)
// pos: sole credential source for real E2E; never falls back to the retired
// 0002 seed accounts, so a missing fixture fails the run loudly
// note: if this file changes, update header and e2e/README.md
//
// Fixture identities are provisioned by the backend test/CI-only seam
// `cmd/e2e-fixture-bootstrap` (or an equivalent controlled provisioning path)
// and reach this resolver through the environment:
//
//   E2E_FIXTURE_ADMIN_EMAIL / E2E_FIXTURE_ADMIN_PASSWORD
//   E2E_FIXTURE_EDITOR_EMAIL / E2E_FIXTURE_EDITOR_PASSWORD
//
// Missing, blank, or legacy-seed values are hard errors: the run fails before
// any browser starts. The published 0002 accounts (admin@example.com /
// editor@example.com / secret123) were disabled by backend migration 00016
// and are refused here so E2E can never silently resume them.

export type FixtureRole = "admin" | "editor";

export type FixtureIdentity = {
  email: string;
  password: string;
};

export const FIXTURE_ENV: Record<
  FixtureRole,
  { email: string; password: string }
> = {
  admin: {
    email: "E2E_FIXTURE_ADMIN_EMAIL",
    password: "E2E_FIXTURE_ADMIN_PASSWORD",
  },
  editor: {
    email: "E2E_FIXTURE_EDITOR_EMAIL",
    password: "E2E_FIXTURE_EDITOR_PASSWORD",
  },
};

/** Published 0002 seed accounts, retired by backend migration 00016. */
const LEGACY_SEED_EMAILS = new Set(["admin@example.com", "editor@example.com"]);
const LEGACY_SEED_PASSWORD = "secret123";

export function resolveFixtureIdentity(role: FixtureRole): FixtureIdentity {
  const names = FIXTURE_ENV[role];
  const email = process.env[names.email] ?? "";
  const password = process.env[names.password] ?? "";

  if (!email.trim()) {
    throw new Error(
      `E2E fixture identity missing for role "${role}": set ${names.email} ` +
        `(provisioned by the backend cmd/e2e-fixture-bootstrap seam). ` +
        `There is no seed fallback — provision explicit per-run fixtures.`,
    );
  }
  if (!password.trim()) {
    throw new Error(
      `E2E fixture identity missing for role "${role}": set ${names.password} ` +
        `(provisioned by the backend cmd/e2e-fixture-bootstrap seam). ` +
        `There is no seed fallback — provision explicit per-run fixtures.`,
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (LEGACY_SEED_EMAILS.has(normalizedEmail)) {
    throw new Error(
      `Refusing retired seed account ${normalizedEmail} for the E2E "${role}" ` +
        `fixture: migration 00016 disabled the 0002 accounts. Provision an ` +
        `explicit per-run identity instead.`,
    );
  }
  if (password === LEGACY_SEED_PASSWORD) {
    throw new Error(
      `Refusing the retired seed password for the E2E "${role}" fixture: ` +
        `migration 00016 disabled the 0002 accounts. Provision an explicit ` +
        `per-run password instead.`,
    );
  }

  return { email: normalizedEmail, password };
}
