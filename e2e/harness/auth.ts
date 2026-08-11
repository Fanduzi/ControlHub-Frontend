// input: @playwright/test, ./fixtures
// output: UI login helper through the Console BFF login form using provisioned
// fixture identities (admin default, editor explicit) — never the retired seeds
// pos: sole UI authentication seam for real E2E flows
// note: if this file changes, update header and e2e/README.md
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import {
  resolveFixtureIdentity,
  type FixtureRole,
} from "./fixtures";

export async function loginViaUI(
  page: Page,
  role: FixtureRole = "admin",
): Promise<void> {
  const { email, password } = resolveFixtureIdentity(role);

  await page.goto("/login");

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 });
}
