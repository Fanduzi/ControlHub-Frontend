import { expect, test } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Database operator drilldown workflow", () => {
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

  test("cluster detail shows operator summary, members, and links to instance", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Step 3: Navigate to resources
    await page.locator('a[href="/resources"]').first().click();
    await expect(
      page.locator("h1", { hasText: /Unified resource inventory/i })
    ).toBeVisible();
    await expect(page.locator("table")).toBeVisible();

    // Step 4–5: Navigate to a known database cluster detail page (id=14)
    // Click the ClickHouse cluster link visible in the table
    const clusterLink = page.locator('a[href="/resources/14"]');
    await expect(clusterLink).toBeVisible();
    await clusterLink.click();

    await expect(page).toHaveURL(/\/resources\/14/, { timeout: 10_000 });

    // Phase 22: Assert decision deck is visible near top
    await expect(
      page.locator("[data-slot='database-decision-deck']")
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Topology analysis/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open topology/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Abnormal members/i })
    ).toBeVisible();

    // Step 6: Assert the cluster operator summary is visible
    await expect(
      page.locator("h3", { hasText: /Operator summary/i })
    ).toBeVisible();

    // Phase 22B: Assert collapsed diagnostic details section (not expanded by default)
    await expect(
      page.locator("h3", { hasText: /Diagnostic details/i })
    ).toBeVisible();
    await expect(
      page.locator("details[data-testid='evidence-details']")
    ).toBeVisible();
    await expect(
      page.locator("details[data-testid='evidence-details']")
    ).not.toHaveAttribute("open");

    // Verify no duplicate "Next checks" heading in workbench
    const nextChecksHeadings = await page.locator("h3", { hasText: /^Next checks$/i }).count();
    expect(nextChecksHeadings).toBeLessThanOrEqual(1);

    // Verify no duplicate topology link in workbench section
    const expandedTopologyLinks = await page.locator("a", { hasText: /Open expanded topology/i }).count();
    expect(expandedTopologyLinks).toBeLessThanOrEqual(1);

    // Audit context still visible
    await expect(
      page.locator("h3", { hasText: /Audit context/i })
    ).toBeVisible();

    // Step 7: Assert member instances table with readable names
    await expect(
      page.locator("h3", { hasText: /Cluster members/i })
    ).toBeVisible();

    // The member table should exist inside the cluster members section
    const membersTable = page
      .locator("section", { hasText: /Cluster members/i })
      .locator("table");
    await expect(membersTable).toBeVisible();

    // Members should have readable display names (links in the table)
    const memberLinks = membersTable.locator("tbody tr td a");
    const memberCount = await memberLinks.count();
    expect(memberCount).toBeGreaterThanOrEqual(1);

    // Each member link should have non-empty readable text
    for (let i = 0; i < memberCount; i++) {
      const text = await memberLinks.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }

    // Step 8: Click the first member instance link
    const firstMemberHref = await memberLinks.first().getAttribute("href");
    expect(firstMemberHref).toMatch(/\/resources\/\d+/);
    await memberLinks.first().click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });

    // Step 9: Assert instance detail shows parent cluster, connection info, profile fields
    await expect(
      page.locator("h3", { hasText: /Identity and ownership/i })
    ).toBeVisible();

    // Parent cluster card
    await expect(
      page.locator("h3", { hasText: /Parent cluster/i })
    ).toBeVisible();

    // The parent cluster card should contain a link back to the cluster
    const parentClusterLink = page
      .locator("section", { hasText: /Parent cluster/i })
      .locator("a[href*='/resources/']");
    await expect(parentClusterLink).toBeVisible();
    const parentLinkText = await parentClusterLink.textContent();
    expect(parentLinkText?.trim().length).toBeGreaterThan(0);

    // Connection info card with hostname/port
    await expect(
      page.locator("h3", { hasText: /Connection info/i })
    ).toBeVisible();

    // Step 10: Topology and audit are reachable from the detail page
    await expect(
      page.locator("h3", { hasText: /Resource topology/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Audit history/i })
    ).toBeVisible();

    // Operational profile section
    await expect(
      page.locator("h3", { hasText: /Operational profile/i })
    ).toBeVisible();

    // Relations section
    await expect(
      page.locator("h3", { hasText: /^Relations$/i })
    ).toBeVisible();
  });
});
