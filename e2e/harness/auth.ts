import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const TEST_EMAIL = "admin@example.com";
const TEST_PASSWORD = "secret123";

export async function loginViaUI(page: Page): Promise<void> {
  await page.goto("/login");

  await page.locator("#email").fill(TEST_EMAIL);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 });
}
