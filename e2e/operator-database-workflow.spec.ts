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

  test("abnormal cluster shows diagnostic deck with topology entry and member drilldown", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Navigate to resources list
    await page.locator('a[href="/resources"]').first().click();
    await expect(
      page.locator("h1", { hasText: /Unified resource inventory/i })
    ).toBeVisible();
    await expect(page.locator("table")).toBeVisible();

    // Navigate to the ClickHouse cluster (id=14) — abnormal/needs-attention
    const clusterLink = page.locator('a[href="/resources/14"]');
    await expect(clusterLink).toBeVisible();
    await clusterLink.click();

    await expect(page).toHaveURL(/\/resources\/14/, { timeout: 10_000 });

    // Phase 22B: Assert diagnostic deck for abnormal cluster
    await expect(
      page.locator("[data-slot='database-decision-deck']")
    ).toBeVisible();
    // Must NOT show compact health deck for an abnormal cluster
    await expect(
      page.locator("[data-testid='database-compact-health-deck']")
    ).not.toBeVisible();

    // Diagnostic panels are visible
    await expect(
      page.locator("h3", { hasText: /Top evidence/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Next checks/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Topology analysis/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Abnormal members/i })
    ).toBeVisible();

    // Diagnostic deck retains the topology link
    await expect(
      page.getByRole("link", { name: /Open topology/i })
    ).toBeVisible();

    // Operator summary visible below deck
    await expect(
      page.locator("h3", { hasText: /Operator summary/i })
    ).toBeVisible();

    // Phase 23: Data consistency panel visible
    await expect(
      page.locator("[data-consistency-status]")
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Data consistency/i })
    ).toBeVisible();

    // No duplicate "Next checks" heading in workbench
    const nextChecksHeadings = await page.locator("h3", { hasText: /^Next checks$/i }).count();
    expect(nextChecksHeadings).toBeLessThanOrEqual(1);

    // No duplicate topology link in workbench section
    const expandedTopologyLinks = await page.locator("a", { hasText: /Open expanded topology/i }).count();
    expect(expandedTopologyLinks).toBeLessThanOrEqual(1);

    // Audit context visible
    await expect(
      page.locator("h3", { hasText: /Audit context/i })
    ).toBeVisible();

    // Cluster members table
    await expect(
      page.locator("h3", { hasText: /Cluster members/i })
    ).toBeVisible();

    const membersTable = page
      .locator("section", { hasText: /Cluster members/i })
      .locator("table");
    await expect(membersTable).toBeVisible();

    const memberLinks = membersTable.locator("tbody tr td a");
    const memberCount = await memberLinks.count();
    expect(memberCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < memberCount; i++) {
      const text = await memberLinks.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }

    // Click first member instance link
    const firstMemberHref = await memberLinks.first().getAttribute("href");
    expect(firstMemberHref).toMatch(/\/resources\/\d+/);
    await memberLinks.first().click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });

    // Instance detail: parent cluster, connection info, profile
    await expect(
      page.locator("h3", { hasText: /Identity and ownership/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Parent cluster/i })
    ).toBeVisible();

    const parentClusterLink = page
      .locator("section", { hasText: /Parent cluster/i })
      .locator("a[href*='/resources/']");
    await expect(parentClusterLink).toBeVisible();
    const parentLinkText = await parentClusterLink.textContent();
    expect(parentLinkText?.trim().length).toBeGreaterThan(0);

    await expect(
      page.locator("h3", { hasText: /Connection info/i })
    ).toBeVisible();

    // Topology and audit reachable
    await expect(
      page.locator("h3", { hasText: /Resource topology/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Audit history/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Operational profile/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /^Relations$/i })
    ).toBeVisible();
  });

  test("healthy instance shows compact deck without topology button", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Navigate directly to a known healthy instance (id=22)
    await page.goto("/resources/22");
    await expect(page).toHaveURL(/\/resources\/22/, { timeout: 10_000 });

    // Phase 22B: Compact health deck is visible
    await expect(
      page.locator("[data-testid='database-compact-health-deck']")
    ).toBeVisible();

    // Compact deck: no links inside (topology button removed)
    const deckLinks = page.locator("[data-testid='database-compact-health-deck']").locator("a");
    await expect(deckLinks).toHaveCount(0);

    // No diagnostic panels for healthy resource
    await expect(
      page.locator("h3", { hasText: /Top evidence/i })
    ).not.toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Next checks/i })
    ).not.toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Abnormal members/i })
    ).not.toBeVisible();

    // Resource topology section still visible below deck
    await expect(
      page.locator("h3", { hasText: /Resource topology/i })
    ).toBeVisible();

    // Phase 23: Instance context panel visible
    await expect(
      page.locator("h3", { hasText: /Instance context/i })
    ).toBeVisible();

    // Phase 23: Data consistency panel visible
    await expect(
      page.locator("h3", { hasText: /Data consistency/i })
    ).toBeVisible();
  });
});
