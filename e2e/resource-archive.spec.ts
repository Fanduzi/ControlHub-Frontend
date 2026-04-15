import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";
import {
  archiveTestResource,
  createTestResource,
  defaultResourceInput,
  getAuthToken,
  testResourceName as makeName,
} from "./api.helpers";

test.describe("Resource archive lifecycle", () => {
  let token: string;
  let resourceName: string;
  let resourceId: string;

  test.beforeAll(async () => {
    token = await getAuthToken();
    resourceName = makeName("archive");

    const resource = await createTestResource(
      token,
      defaultResourceInput({ name: resourceName }),
    );
    resourceId = resource.id;
  });

  test.afterAll(async () => {
    if (resourceId) {
      await archiveTestResource(token, resourceId).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("archived resource is hidden from default list", async ({ page }) => {
    // Archive the resource via API first
    await archiveTestResource(token, resourceId);

    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Search for the archived resource
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, or ID")
      .fill(resourceName);

    // Default view (active only) should not show the archived resource
    await expect(page.locator("table").first().locator("tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify empty state or no matching row for our archived resource
    const rows = page.locator("table").first().locator("tbody tr");
    const rowTexts = await rows.allTextContents();
    const hasResource = rowTexts.some((t) => t.includes(resourceName));
    expect(hasResource).toBe(false);
  });

  test("include archived filter reveals archived resources", async ({ page }) => {
    // Resource was archived in the previous test; ensure it's archived
    await archiveTestResource(token, resourceId).catch(() => {});

    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Open the archive filter and select "Include archived"
    await page
      .locator("main")
      .getByRole("combobox", { name: "Archive state" })
      .click();
    await page.getByRole("option", { name: "Include archived" }).click();

    // Search for the resource
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, or ID")
      .fill(resourceName);

    await expect(
      page.locator("table").first().locator("tbody tr").first(),
    ).toBeVisible({ timeout: 10_000 });

    // The archived resource row should now be visible
    const rows = page.locator("table").first().locator("tbody tr");
    const rowTexts = await rows.allTextContents();
    const hasResource = rowTexts.some((t) => t.includes(resourceName));
    expect(hasResource).toBe(true);
  });

  test("detail sheet shows archive button for active resources", async ({ page }) => {
    // Create a fresh active resource for this test
    const freshName = makeName("archive-active");
    const fresh = await createTestResource(
      token,
      defaultResourceInput({ name: freshName }),
    );

    try {
      await page.goto("/resources");
      await expect(page.locator("table").first()).toBeVisible({
        timeout: 15_000,
      });

      // Search and click the resource row
      await page
        .locator("main")
        .getByPlaceholder("Search resource, owner, or ID")
        .fill(freshName);

      await expect(
        page.locator("table").first().locator("tbody tr").first(),
      ).toBeVisible({ timeout: 10_000 });

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
    } finally {
      await archiveTestResource(token, fresh.id).catch(() => {});
    }
  });

  test("archived only filter shows exclusively archived resources", async ({ page }) => {
    // Resource was archived in earlier tests; ensure it's archived
    await archiveTestResource(token, resourceId).catch(() => {});

    // Create a fresh active resource to prove it's excluded
    const activeName = makeName("archive-active-filter");
    const active = await createTestResource(
      token,
      defaultResourceInput({ name: activeName }),
    );

    try {
      await page.goto("/resources");
      await expect(page.locator("table").first()).toBeVisible({
        timeout: 15_000,
      });

      // Open the archive filter and select "Archived only"
      await page
        .locator("main")
        .getByRole("combobox", { name: "Archive state" })
        .click();
      await page.getByRole("option", { name: "Archived only" }).click();

      await expect(
        page.locator("table").first().locator("tbody tr").first(),
      ).toBeVisible({ timeout: 10_000 });

      // The archived resource should be visible
      const rows = page.locator("table").first().locator("tbody tr");
      const rowTexts = await rows.allTextContents();
      const hasArchived = rowTexts.some((t) => t.includes(resourceName));
      expect(hasArchived).toBe(true);

      // The active resource should NOT be visible
      const hasActive = rowTexts.some((t) => t.includes(activeName));
      expect(hasActive).toBe(false);
    } finally {
      await archiveTestResource(token, active.id).catch(() => {});
    }
  });
});
