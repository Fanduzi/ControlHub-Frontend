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
