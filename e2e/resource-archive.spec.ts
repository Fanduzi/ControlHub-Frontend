import { expect, test } from "@playwright/test";

import {
  archiveTestResource,
  createTestResource,
  defaultResourceInput,
  getAuthToken,
  testResourceName as makeName,
} from "./api.helpers";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Resource archive lifecycle", () => {
  let token: string;
  let activeName: string;
  let activeId: number;
  let archivedName: string;
  let archivedId: number;
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    token = await getAuthToken();

    // Create one active resource
    activeName = makeName("archive-active");
    const active = await createTestResource(
      token,
      defaultResourceInput({ name: activeName }),
    );
    activeId = active.id;

    // Create one resource and immediately archive it
    archivedName = makeName("archive-archived");
    const toArchive = await createTestResource(
      token,
      defaultResourceInput({ name: archivedName }),
    );
    archivedId = toArchive.id;
    await archiveTestResource(token, archivedId);
  });

  test.afterAll(async () => {
    // Cleanup: archive any active resources created during tests
    await archiveTestResource(token, activeId).catch(() => {});
    // Archived resource is already archived — no extra cleanup needed
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page);
    networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
  });

  test("default view shows active resources but not archived ones", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // The active resource should be findable by search
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, hostname, IP, or ID")
      .fill(activeName);

    await expect(
      page.getByText(activeName).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Now search for the archived resource — it should NOT appear
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, hostname, IP, or ID")
      .fill(archivedName);

    // Wait for the table to settle (either empty state or non-matching rows)
    await page.waitForTimeout(1000);

    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain(archivedName);
  });

  test("include archived filter reveals archived resources", async ({ page }) => {
    // Navigate directly with the archive filter applied and search pre-filled
    await page.goto(`/resources?archiveFilter=includeArchived&q=${archivedName}`);
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // The archived resource should appear in the results
    await expect(
      page.getByText(archivedName).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("archived only filter shows exclusively archived resources", async ({ page }) => {
    await page.goto(
      `/resources?archiveFilter=archivedOnly&q=${encodeURIComponent(archivedName)}`,
    );
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByText(archivedName).first(),
    ).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain(activeName);
  });

  test("detail sheet shows archive button for active resources", async ({ page }) => {
    await page.goto(`/resources?q=${activeName}`);
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click the resource row to open the detail sheet
    await page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // The Archive button should be present in the sheet header
    await expect(
      sheet.getByRole("button", { name: "Archive" }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("selecting archive filter via UI updates the URL and re-fetches", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Open the archive filter and select "Include archived" via UI
    await page
      .locator("main")
      .getByRole("combobox", { name: "Archive state" })
      .click();
    await page.getByRole("option", { name: "Include archived" }).click();

    // Wait for the URL to contain the archiveFilter param
    await expect(page).toHaveURL(/archiveFilter=includeArchived/, {
      timeout: 10_000,
    });

    // Wait for the table to re-render after server-side navigation
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 10_000,
    });

    // Now search for the archived resource
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, hostname, IP, or ID")
      .fill(archivedName);

    // The archived resource should now be visible
    await expect(
      page.getByText(archivedName).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(() => {
    assertClean(consoleMessages, networkErrors);
  });
});
