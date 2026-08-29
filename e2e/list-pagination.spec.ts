import { expect, type Page, test } from "@playwright/test";

import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

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

function formatRequestSummary(requests: RecordedRequest[]): string {
  if (requests.length === 0) return "  (none)";
  return requests
    .map((r, i) => `  [${i}] ${r.method} ${r.pathname}${r.search} → ${JSON.stringify(r.searchParams)}`)
    .join("\n");
}

async function expectRequestParam(
  pathname: string,
  key: string,
  value: string,
  page?: Page,
): Promise<void> {
  await expect
    .poll(async () => {
      const requests = await getRecordedRequests(pathname);
      if (requests.some((r) => r.searchParams[key] === value)) return true;

      const url = page ? new URL(page.url()) : undefined;
      return [
        `No recorded ${pathname} request with ${key}=${value}`,
        `  request count: ${requests.length}`,
        url ? `  browser URL: ${url.pathname}${url.search}` : null,
        `  recorded requests:`,
        formatRequestSummary(requests),
      ].filter(Boolean).join("\n");
    })
    .toBe(true);
}

async function expectRequestHasParam(
  pathname: string,
  key: string,
  page?: Page,
): Promise<void> {
  await expect
    .poll(async () => {
      const requests = await getRecordedRequests(pathname);
      if (requests.some((r) => Boolean(r.searchParams[key]))) return true;

      const url = page ? new URL(page.url()) : undefined;
      return [
        `No recorded ${pathname} request with param '${key}' present`,
        `  request count: ${requests.length}`,
        url ? `  browser URL: ${url.pathname}${url.search}` : null,
        `  recorded requests:`,
        formatRequestSummary(requests),
      ].filter(Boolean).join("\n");
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

async function verifyProxyRecording(pathname: string): Promise<void> {
  await resetRecordedRequests(pathname);
  const proxyUrl = `http://localhost:8081${pathname}?_proxy_check=1`;
  await fetch(proxyUrl).catch(() => {});
  const requests = await getRecordedRequests(pathname);
  if (requests.length === 0) {
    throw new Error(
      `API proxy on :8081 did not record the ${pathname} request. ` +
      `The dev server on :3100 may be running without E2E proxy env vars. ` +
      `Kill the server on :3100 and re-run the tests.`,
    );
  }
  await resetRecordedRequests(pathname);
}

test.describe("List pagination and backend query params", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    await verifyProxyRecording("/resources");
    await verifyProxyRecording("/audit-events");
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

  test("resources pagination sends page and pageSize query params", async ({
    page,
  }) => {
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
      await expectRequestParam("/resources", "page", "2", page);
    }

    await resetRecordedRequests("/resources");
    await page.getByRole("combobox", { name: "Rows per page" }).click();
    await page.getByRole("option", { name: "50 / page" }).click();
    await expectUrlParam(page, "page", "1");
    await expectUrlParam(page, "pageSize", "50");
    await expectRequestParam("/resources", "pageSize", "50", page);
  });

  test("resources search and filters reset to page 1 and stay in query params", async ({
    page,
  }) => {
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
    await expectRequestParam("/resources", "q", "orders", page);

    // Environment filter keeps readable URL slug while backend receives environmentId
    await resetRecordedRequests("/resources");
    await page.locator('header [role="combobox"]').first().click();
    await page.getByRole("option", { name: /Production|Staging|Development/ }).first().click();
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return Boolean(url.searchParams.get("environment"));
      })
      .toBe(true);
    expect(new URL(page.url()).searchParams.has("environmentId")).toBe(false);
    await expectRequestHasParam("/resources", "environmentId", page);
    await expectUrlParam(page, "page", "1");

    // Resource type filter sends resourceType param (MultiSelectFilter uses DropdownMenu)
    await resetRecordedRequests("/resources");
    await page.locator('[data-slot="multi-select-trigger"]').filter({ hasText: "Filter type" }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Service" }).click();
    await expectUrlParam(page, "resourceType", "service");
    await expectRequestParam("/resources", "resourceType", "service", page);
    await page.keyboard.press("Escape");

    // Lifecycle status filter sends lifecycleStatus param (MultiSelectFilter uses DropdownMenu, not combobox)
    await resetRecordedRequests("/resources");
    await page.locator('[data-slot="multi-select-trigger"]').filter({ hasText: "Lifecycle status" }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Running" }).click();
    await expectUrlParam(page, "lifecycleStatus", "running");
    await expectRequestParam("/resources", "lifecycleStatus", "running", page);
    await page.keyboard.press("Escape");

    // Health status filter sends healthStatus param
    await resetRecordedRequests("/resources");
    await page.locator('[data-slot="multi-select-trigger"]').filter({ hasText: "Health status" }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Warning" }).click();
    await expectUrlParam(page, "healthStatus", "warning");
    await expectRequestParam("/resources", "healthStatus", "warning", page);

    // Legacy 'type' param should not appear
    expect(new URL(page.url()).searchParams.has("type")).toBe(false);
  });

  test("audits pagination and filters send page, eventType, and result query params", async ({
    page,
  }) => {
    await page.goto("/audits?page=1&pageSize=1");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("combobox", { name: "Rows per page" })).toBeVisible();

    // If there is a next page, test pagination
    const nextButton = page.getByRole("button", { name: "Next page" });
    if (await nextButton.isVisible().catch(() => false)) {
      await resetRecordedRequests("/audit-events");
      await nextButton.click();
      await expectUrlParam(page, "page", "2");
      await expectRequestParam("/audit-events", "page", "2", page);
    }

    // Event type filter (MultiSelectFilter uses DropdownMenu, not combobox)
    await resetRecordedRequests("/audit-events");
    await page.locator('[data-slot="multi-select-trigger"]').filter({ hasText: "Event type" }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Resource updated", exact: true }).click();
    await expectUrlParam(page, "page", "1");
    await expectUrlParam(page, "eventType", "resource.updated");
    await expectRequestParam("/audit-events", "eventType", "resource.updated", page);
    await page.keyboard.press("Escape");

    // Result filter
    await resetRecordedRequests("/audit-events");
    await page.locator('[data-slot="multi-select-trigger"]').filter({ hasText: "Result" }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "success" }).click();
    await expectUrlParam(page, "result", "success");
    await expectRequestParam("/audit-events", "result", "success", page);
  });

  test.afterEach(() => {
    assertClean(consoleMessages, networkErrors);
  });
});
