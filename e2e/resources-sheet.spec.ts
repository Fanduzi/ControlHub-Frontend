import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";
import {
  createTestResource,
  defaultResourceInput,
  getAuthToken,
  testResourceName as makeName,
} from "./api.helpers";

test.describe("Resources detail sheet", () => {
  let token: string;
  let resourceName: string;

  test.beforeAll(async () => {
    token = await getAuthToken();
    resourceName = makeName("sheet");

    // Create a test resource via API so we can find it deterministically
    // Backend does not support hard-delete; resource remains with e2e- prefix.
    await createTestResource(
      token,
      defaultResourceInput({ name: resourceName }),
    );
    // Test resource remains with e2e- prefix.
  });

  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("renders live resource rows from backend", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("clicking a resource row opens the detail sheet", async ({ page }) => {
    // Search for our API-created test resource
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, or ID")
      .fill(resourceName);

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
  });

  test("detail sheet shows backend profile data", async ({ page }) => {
    // Search for our API-created test resource
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, or ID")
      .fill(resourceName);

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

    // Sheet should contain the profile section heading
    await expect(
      sheet.locator("text=Operational profile").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
