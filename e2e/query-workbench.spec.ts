import { expect, test } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Query Workbench shell", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
      ],
      allowedWarnings: [
        /was preloaded using link preload but not used/,
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
      const screenshotPath = `query-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    assertClean(consoleMessages, networkErrors);
  });

  test("loads with real backend data and an execution-disabled banner", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await expect(page).toHaveURL(/\/query/);
    await expect(
      page.getByRole("heading", { name: /Query Workbench/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Query execution is not enabled"),
    ).toBeVisible();
  });

  test("target switcher surfaces at least one database target", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    // The switcher is populated from the backend query-target list.
    await expect(page.locator("#query-target-switcher")).toBeVisible();
    await expect(page.getByText(/\d+ targets/)).toBeVisible();
    await expect(page.getByText("0 targets")).toHaveCount(0);

    // An active target's host fact is rendered from backend connection context.
    await expect(page.getByText(/.+:\d+/).first()).toBeVisible();
  });

  test("renders no enabled Run or Execute action", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await expect(
      page.getByRole("button", { name: /run locked/i }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /explain locked/i }),
    ).toBeDisabled();

    // No enabled button may be labelled Run or Execute.
    const enabledExecutionButtons = await page
      .getByRole("button", { name: /^(run|execute)$/i })
      .count();
    expect(enabledExecutionButtons).toBe(0);
  });

  test("switching the target updates the governance panel facts", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    const trigger = page.locator("#query-target-switcher");
    await trigger.click();

    const options = page.getByRole("option");
    const optionCount = await options.count();

    // Requires a seed with at least two query targets. Skips deterministically
    // otherwise so the suite stays green on single-target seeds.
    test.skip(optionCount < 2, "query workbench E2E needs >= 2 seeded targets");

    const firstHost = await page.getByText(/.+:\d+/).first().textContent();

    // Pick a different target than the currently active one.
    await options.nth(1).click();

    const updatedHost = await page.getByText(/.+:\d+/).first().textContent();
    expect(updatedHost).toBeTruthy();
    expect(updatedHost).not.toBe(firstHost);
  });
});
