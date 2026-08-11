// input: @playwright/test, ./harness/*
// output: Playwright E2E for query credential settings admin flows
// pos: browser verification of credential settings including cookie-only role recovery under BFF
// note: if this file changes, update header and e2e/README.md
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

    await expect(
      page.getByRole("heading", { name: /Query credential administration/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Total").first()).toBeVisible();
    await expect(page.getByText("Ready").first()).toBeVisible();
    await expect(page.getByText("Needs attention").first()).toBeVisible();
    await expect(page.getByText("Unsupported").first()).toBeVisible();
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

    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: /more filters/i }),
    ).toBeVisible();
  });

  test("selecting a target in the table shows the credential detail panel", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog.locator("#credential-ref")).toBeVisible({ timeout: 15_000 });
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

  test("DBA operating model guidance is visible under collapsed help", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });
    await firstTargetButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText("Standard read-only account"),
    ).toHaveCount(0);
    await expect(
      page.getByText("Cluster-specific override"),
    ).toHaveCount(0);

    await expect(
      dialog.locator("#credential-ref"),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/ControlHub stores only the reference/).first(),
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

    await expect(
      page.getByRole("link", { name: /open credential settings/i }),
    ).toBeVisible();

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

  test("/settings page exposes Query Credential settings entry", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings$/);

    // The query credentials section should be visible.
    await expect(
      page.getByText("Query credential settings").first(),
    ).toBeVisible({ timeout: 15_000 });

    // The description should mention metadata references.
    await expect(
      page.getByText(/metadata reference/i).first(),
    ).toBeVisible();

    // Admin action link should be visible.
    const adminLink = page.getByRole("link", {
      name: /open credential settings/i,
    });
    await expect(adminLink).toBeVisible();
    await expect(adminLink).toHaveAttribute(
      "href",
      "/settings/query-credentials",
    );
  });

  test("direct URL /settings/query-credentials shows admin controls after role recovery (cookie-only)", async ({
    page,
  }) => {
    // BFF login seals HttpOnly operator session and sets presentation role cookie.
    await loginViaUI(page);

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);

    // Clear sessionStorage auth state. BFF bearer stays HttpOnly; presentation
    // role remains in the controlhub.role cookie for new-tab / direct-URL recovery.
    const cookieRole = await page.evaluate(() => {
        window.sessionStorage.removeItem("controlhub.role");
      const match = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("controlhub.role="));
      return match ? match.slice("controlhub.role=".length) : null;
    });
    expect(cookieRole).toBe("admin");

    await page.goto("/settings/query-credentials");
    await expect(page).toHaveURL(/\/settings\/query-credentials/);

    await expect(
      page.getByRole("heading", { name: /Query credential administration/i }),
    ).toBeVisible({ timeout: 15_000 });

    const tableRows = page.locator("table tbody tr");
    await expect(tableRows.first()).toBeVisible({ timeout: 15_000 });

    const backfilledRole = await page.evaluate(() =>
      window.sessionStorage.getItem("controlhub.role"),
    );
    expect(backfilledRole).toBe("admin");
  });

  test("selecting a credential target opens the credential dialog", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const firstTargetButton = page.locator("table tbody tr td button").first();
    await expect(firstTargetButton).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("complementary", {
      name: /credential detail inspector/i,
    })).toHaveCount(0);

    await firstTargetButton.click();

    const selectedRow = page.locator("table tbody tr[aria-selected='true']");
    await expect(selectedRow).toBeVisible({ timeout: 10_000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog.locator("#credential-ref")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("complementary", {
      name: /credential detail inspector/i,
    })).toHaveCount(0);
  });

  test("operations pagination navigates to next page with different rows", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const tableRows = page.locator("table tbody tr");
    await expect(tableRows.first()).toBeVisible({ timeout: 15_000 });

    const firstPageFirstTarget = await tableRows
      .first()
      .locator("td button")
      .first()
      .textContent();
    expect(firstPageFirstTarget).toBeTruthy();

    const showingText = page.getByText(/Showing \d+–\d+ of \d+/);
    await expect(showingText).toBeVisible();

    const match = (await showingText.textContent())?.match(
      /Showing (\d+)–(\d+) of (\d+)/,
    );
    if (match === null || match === undefined) {
      throw new Error("Pagination showing text must match expected format");
    }
    const end = Number(match[2]);
    const total = Number(match[3]);
    expect(
      total,
      `Backend must seed enough targets for pagination (total=${total}, need > page size)`,
    ).toBeGreaterThan(end);

    const nextButton = page.getByRole("button", { name: "Next page" });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(showingText).toContainText(
      new RegExp(`Showing ${end + 1}–\\d+ of ${total}`),
    );

    const secondPageFirstTarget = await tableRows
      .first()
      .locator("td button")
      .first()
      .textContent();

    expect(
      secondPageFirstTarget,
      "First row on page 2 must differ from page 1",
    ).not.toBe(firstPageFirstTarget);
  });

  test("operations pagination supports 25, 50, and 100 rows per page", async ({
    page,
  }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const showingText = page.getByText(/Showing \d+–\d+ of \d+/);
    await expect(showingText).toBeVisible({ timeout: 15_000 });
    const match = (await showingText.textContent())?.match(
      /Showing (\d+)–(\d+) of (\d+)/,
    );
    if (match === null || match === undefined) {
      throw new Error("Pagination showing text must match expected format");
    }
    const total = Number(match[3]);
    const pageSizeSelect = page.getByRole("combobox", {
      name: "Rows per page",
    });

    for (const pageSize of [50, 100, 25]) {
      await pageSizeSelect.click();
      await page
        .getByRole("option", { name: `${pageSize} / page`, exact: true })
        .click();
      await expect(pageSizeSelect).toContainText(`${pageSize} / page`);
      await expect(showingText).toContainText(
        `Showing 1–${Math.min(pageSize, total)} of ${total}`,
      );
      await expect(page.locator("table tbody tr").first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("saving a configured credential shows success feedback", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/settings/query-credentials");

    const editButton = page
      .getByRole("button", { name: "Edit" })
      .first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();

    const dialog = page.getByRole("dialog");
    const credentialRef = dialog.locator("#credential-ref");
    await expect(credentialRef).toBeVisible({ timeout: 15_000 });
    await expect(credentialRef).not.toHaveValue("", { timeout: 15_000 });

    await dialog
      .getByRole("button", { name: "Save" })
      .click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Credential metadata saved.",
      { timeout: 15_000 },
    );
  });
});
