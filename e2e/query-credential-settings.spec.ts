import { expect, test } from "@playwright/test";

import { loginViaUI } from "./harness/auth";
import { checkBackendHealth } from "./harness/backend-health";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

/**
 * Non-admin access to /settings/query-credentials is covered by component
 * tests (query-credential-settings.test.tsx) because the backend seed
 * account is admin-only and there is no non-admin seed. The component
 * tests verify:
 *   - Non-admin sees "managed by administrators" message
 *   - Non-admin never sees credential input / checkbox / policy select / buttons
 *   - Non-admin never triggers getQueryCredential / saveQueryCredential / deleteQueryCredential
 *   - Non-admin never sees coverage summary, operations table, or filter controls
 */
test.describe("Query credential settings", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
      allowedWarnings: [/was preloaded using link preload but not used/],
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
      const screenshotPath = `query-credential-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    assertClean(consoleMessages, networkErrors);
  });

  test("opens the settings query-credentials page as admin", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    await expect(page).toHaveURL(/\/settings\/query-credentials/);
    await expect(
      page.getByRole("heading", { name: /Query credential administration/i }),
    ).toBeVisible();
  });

  test("shows coverage summary cards", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    // Coverage overview section should be visible.
    await expect(
      page.getByText("Coverage overview"),
    ).toBeVisible({ timeout: 15_000 });

    // Summary card labels should be visible.
    await expect(page.getByText("Total targets").first()).toBeVisible();
    await expect(page.getByText("Ready").first()).toBeVisible();
    await expect(page.getByText("Missing metadata").first()).toBeVisible();
  });

  test("shows the operations table with credential data", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    // Wait for the operations table to render with at least one row.
    const tableRows = page.locator("table tbody tr");
    await expect(tableRows.first()).toBeVisible({ timeout: 15_000 });

    const count = await tableRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("shows filter controls", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    // Filter section should be visible.
    await expect(page.getByText("Filters")).toBeVisible({ timeout: 15_000 });

    // Search input should be visible.
    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible();
  });

  test("selecting a target in the table shows the credential detail panel", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    // Wait for the table to render.
    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // The detail panel should show the credential binding title.
    await expect(
      page.getByText("Credential binding").first(),
    ).toBeVisible();
  });

  test("credential detail panel shows runtime status and form fields", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // Wait for the detail panel to fully load (credential-ref input appears).
    await expect(page.locator("#credential-ref")).toBeVisible({ timeout: 15_000 });

    // Credential reference input should be visible.
    await expect(page.locator("#credential-ref")).toBeVisible();

    // Enabled checkbox should be visible.
    await expect(page.locator("#credential-enabled")).toBeVisible();

    // Environment policy select should be visible.
    await expect(page.locator("#environment-policy")).toBeVisible();
  });

  test("credential detail panel never shows DSN or password fields", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // Wait for detail panel to load (credential-ref input appears).
    await expect(page.locator("#credential-ref")).toBeVisible({ timeout: 15_000 });

    // No password input field anywhere on the page.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // No DSN or password input fields by name.
    await expect(page.locator('input[name="dsn"], input[name="password"]')).toHaveCount(0);

    // The credential form only has: credential-ref, enabled checkbox, environment-policy select.
    await expect(page.locator("#credential-ref")).toBeVisible();
    await expect(page.locator("#credential-enabled")).toBeVisible();
    await expect(page.locator("#environment-policy")).toBeVisible();
  });

  test("DBA operating model guidance is visible", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // Standard read-only account guidance.
    await expect(
      page.getByText("Standard read-only account").first(),
    ).toBeVisible();

    // Cluster-specific override guidance.
    await expect(
      page.getByText("Cluster-specific override").first(),
    ).toBeVisible();
  });

  test("all-environments policy shows confirmation checkbox", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // Select "All environments" policy.
    const policySelect = page.locator("#environment-policy");
    await policySelect.click();
    await page.getByRole("option", { name: /all environments/i }).click();

    // Confirmation checkbox should appear.
    await expect(
      page.locator("#confirm-all-environments"),
    ).toBeVisible();

    // Save button should be disabled until confirmation.
    const saveButton = page.getByRole("button", { name: /save|configure/i });
    await expect(saveButton).toBeDisabled();
  });

  test("Query Workbench shows credential status but no edit controls", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/query");

    await expect(page).toHaveURL(/\/query/);

    // The governance panel should show credential state label.
    await expect(
      page.getByText(/Credential state/).first(),
    ).toBeVisible();

    // No credential edit controls in the workbench.
    await expect(page.locator("#credential-ref")).toHaveCount(0);
    await expect(page.locator("#credential-enabled")).toHaveCount(0);
    await expect(page.locator("#environment-policy")).toHaveCount(0);
  });

  test("Query Workbench shows admin link for admin users", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/query");

    await expect(page).toHaveURL(/\/query/);

    // Admin should see the "Open credential settings" link.
    const adminLink = page.getByRole("link", {
      name: /open credential settings/i,
    });
    await expect(adminLink).toBeVisible({ timeout: 15_000 });
    await expect(adminLink).toHaveAttribute(
      "href",
      "/settings/query-credentials",
    );
  });

  test("search filters the operations table", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // Type a search term that won't match any target.
    await searchInput.fill("nonexistent-xyz-123");

    // The empty state should appear.
    await expect(
      page.getByText(/No targets match/),
    ).toBeVisible();
  });

  test("boundary note explains server-side credential storage", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    // Boundary note should explain that DSN/password stays server-side.
    await expect(
      page.getByText(/ControlHub stores only the reference/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/CONTROLHUB_QUERY_CREDENTIAL_/).first(),
    ).toBeVisible();
  });
});
