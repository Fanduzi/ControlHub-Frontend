import { expect, test } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Operator console smoke", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        // Next.js dev overlay noise
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
      ],
    });
    networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `smoke-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    assertClean(consoleMessages, networkErrors);
  });

  test("login redirects to overview", async ({ page }) => {
    await loginViaUI(page);

    await expect(
      page.locator("h1", { hasText: /Operational posture/i })
    ).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
  });

  test("overview page loads metrics", async ({ page }) => {
    await loginViaUI(page);

    await expect(
      page.locator("h1", { hasText: /Operational posture/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Resource posture/i })
    ).toBeVisible();
  });

  test("resources page shows table", async ({ page }) => {
    await loginViaUI(page);

    await page.locator('a[href="/resources"]').first().click();

    await expect(
      page.locator("h1", { hasText: /Unified resource inventory/i })
    ).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("resource detail page loads via link click", async ({ page }) => {
    await loginViaUI(page);

    await page.locator('a[href="/resources"]').first().click();
    await expect(page.locator("table")).toBeVisible();

    const firstResourceLink = page.locator("table tbody tr td a").first();
    await firstResourceLink.click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 3, name: /Identity and ownership/i }).first()
    ).toBeVisible();
  });

  test("databases page shows table", async ({ page }) => {
    await loginViaUI(page);

    await page.locator('a[href="/databases"]').first().click();

    await expect(
      page.locator("h1", { hasText: /Database clusters and instances/i })
    ).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("settings page loads dictionaries", async ({ page }) => {
    await loginViaUI(page);

    await page.locator('a[href="/settings"]').first().click();

    await expect(
      page.locator("h1", { hasText: /Reference dictionaries/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Appearance/i })
    ).toBeVisible();
  });

  test("audits page shows feed", async ({ page }) => {
    await loginViaUI(page);

    await page.locator('a[href="/audits"]').first().click();

    await expect(
      page.locator("h1", { hasText: /Baseline audit events/i })
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: /Audit feed/i })
    ).toBeVisible();
  });
});
