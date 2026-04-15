import { expect, type Page, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

type RecordedRequest = {
  pathname: string;
  search: string;
  searchParams: Record<string, string>;
  method: string;
};

async function resetRecordedRequests(pathname: string): Promise<void> {
  const response = await fetch(
    `http://localhost:8081/__reset-recorded-requests?path=${encodeURIComponent(pathname)}`,
  );

  if (!response.ok) {
    throw new Error(`Unable to reset recorded requests for ${pathname}: ${response.status}`);
  }
}

async function getRecordedRequests(pathname: string): Promise<RecordedRequest[]> {
  const response = await fetch(
    `http://localhost:8081/__recorded-requests?path=${encodeURIComponent(pathname)}`,
  );

  if (!response.ok) {
    throw new Error(`Unable to read recorded requests for ${pathname}: ${response.status}`);
  }

  return (await response.json()) as RecordedRequest[];
}

async function expectRequestParam(
  pathname: string,
  key: string,
  value: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const requests = await getRecordedRequests(pathname);
      return requests.some((request) => request.searchParams[key] === value);
    })
    .toBe(true);
}

async function expectUrlParam(
  page: Page,
  key: string,
  value: string,
): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.get(key))
    .toBe(value);
}

test.describe("List pagination and backend query params", () => {
  test("resources pagination sends page and pageSize query params", async ({
    page,
  }) => {
    await loginViaApi(page);

    await page.goto("/resources?page=1&pageSize=1");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });

    // Verify pagination controls exist (backend has enough seed data for this)
    await expect(page.getByRole("combobox", { name: "Rows per page" })).toBeVisible();

    // If there is a next page button, test pagination
    const nextButton = page.getByRole("button", { name: "Next page" });
    if (await nextButton.isVisible().catch(() => false)) {
      await resetRecordedRequests("/resources");
      await nextButton.click();
      await expectUrlParam(page, "page", "2");
      await expectRequestParam("/resources", "page", "2");
    }

    await resetRecordedRequests("/resources");
    await page.getByRole("combobox", { name: "Rows per page" }).click();
    await page.getByRole("option", { name: "50 / page" }).click();
    await expectUrlParam(page, "page", "1");
    await expectUrlParam(page, "pageSize", "50");
    await expectRequestParam("/resources", "pageSize", "50");
  });

  test("resources search and filters reset to page 1 and stay in query params", async ({
    page,
  }) => {
    await loginViaApi(page);

    await page.goto("/resources?page=1&pageSize=20");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });

    // Search resets to page 1
    await resetRecordedRequests("/resources");
    await page
      .locator("main")
      .getByPlaceholder("Search resource, owner, or ID")
      .fill("orders");
    await expectUrlParam(page, "page", "1");
    await expectUrlParam(page, "q", "orders");
    await expectRequestParam("/resources", "q", "orders");

    // Environment filter sends environmentId param
    // Select the first environment option, then read the actual ID from the URL
    await resetRecordedRequests("/resources");
    await page.locator('header [role="combobox"]').first().click();
    await page.getByRole("option", { name: /Production|Staging|Development/ }).first().click();
    // Wait for the environmentId to appear in the URL
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return url.searchParams.has("environmentId");
      })
      .toBe(true);
    const environmentId = new URL(page.url()).searchParams.get("environmentId")!;
    await expectRequestParam("/resources", "environmentId", environmentId);
    await expectUrlParam(page, "page", "1");

    // Resource type filter sends resourceType param
    await resetRecordedRequests("/resources");
    await page.getByRole("combobox", { name: "Filter type" }).click();
    await page.getByRole("option", { name: "Service" }).click();
    await expectUrlParam(page, "resourceType", "service");
    await expectRequestParam("/resources", "resourceType", "service");

    // Lifecycle status filter sends lifecycleStatus param
    await resetRecordedRequests("/resources");
    await page.getByRole("combobox", { name: "Lifecycle status" }).click();
    await page.getByRole("option", { name: "Running" }).click();
    await expectUrlParam(page, "lifecycleStatus", "running");
    await expectRequestParam("/resources", "lifecycleStatus", "running");

    // Health status filter sends healthStatus param
    await resetRecordedRequests("/resources");
    await page.getByRole("combobox", { name: "Health status" }).click();
    await page.getByRole("option", { name: "Warning" }).click();
    await expectUrlParam(page, "healthStatus", "warning");
    await expectRequestParam("/resources", "healthStatus", "warning");

    // Legacy 'type' param should not appear
    expect(new URL(page.url()).searchParams.has("type")).toBe(false);
  });

  test("audits pagination and filters send page, eventType, and result query params", async ({
    page,
  }) => {
    await loginViaApi(page);

    await page.goto("/audits?page=1&pageSize=1");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("combobox", { name: "Rows per page" })).toBeVisible();

    // If there is a next page, test pagination
    const nextButton = page.getByRole("button", { name: "Next page" });
    if (await nextButton.isVisible().catch(() => false)) {
      await resetRecordedRequests("/audit-events");
      await nextButton.click();
      await expectUrlParam(page, "page", "2");
      await expectRequestParam("/audit-events", "page", "2");
    }

    // Event type filter
    await resetRecordedRequests("/audit-events");
    await page.getByRole("combobox", { name: "Event type" }).click();
    await page.getByRole("option", { name: "Resource updated" }).click();
    await expectUrlParam(page, "page", "1");
    await expectUrlParam(page, "eventType", "resource.updated");
    await expectRequestParam("/audit-events", "eventType", "resource.updated");

    // Result filter
    await resetRecordedRequests("/audit-events");
    await page.getByRole("combobox", { name: "Result" }).click();
    await page.getByRole("option", { name: "success" }).click();
    await expectUrlParam(page, "result", "success");
    await expectRequestParam("/audit-events", "result", "success");
  });
});
