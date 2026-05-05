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

    // Phase 23/25: Page information check panel visible
    await expect(
      page.locator("[data-consistency-status]")
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Page information check|页面信息核对/i })
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

    // Phase 24: Supporting details section for cluster
    await expect(
      page.locator("[data-slot='database-supporting-details']")
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

    // Instance detail: identity and merged facts panel
    await expect(
      page.locator("h3", { hasText: /Identity and ownership/i })
    ).toBeVisible();

    // Phase 24: Merged instance facts panel (no duplicate parent cluster/connection cards)
    await expect(
      page.locator("h3", { hasText: /Instance context and consistency|实例上下文与一致性/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Parent cluster/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Connection info/i })
    ).toHaveCount(0);

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

    // Phase 24: Supporting details section present
    await expect(
      page.locator("[data-slot='database-supporting-details']")
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

    // Phase 24: Merged instance context and consistency panel
    await expect(
      page.locator("h3", { hasText: /Instance context and consistency|实例上下文与一致性/i })
    ).toBeVisible();

    // Phase 24: No duplicate parent cluster / connection full cards
    await expect(
      page.getByRole("heading", { name: /Parent cluster/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Connection info/i })
    ).toHaveCount(0);

    // Phase 24: No "0 members" text
    await expect(
      page.locator("body", { hasText: /0 members|0 个成员/ })
    ).toHaveCount(0);

    // Phase 24: Supporting details section
    await expect(
      page.locator("[data-slot='database-supporting-details']")
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Operational profile/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /^Relations$/i })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: /Audit history/i })
    ).toBeVisible();

    // Phase 25: Audit history is full width in supporting details
    const auditPanel = page.locator("[data-testid='database-supporting-full-width']");
    await expect(auditPanel).toBeVisible();
    await expect(auditPanel.locator("h3", { hasText: /Audit history/i })).toBeVisible();
  });

  test("database list shows operational signal column with member-derived signals", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Navigate to databases page
    await page.locator('a[href="/databases"]').first().click();
    await expect(page.locator("table")).toBeVisible();

    // Operational signal column header is visible
    await expect(
      page.locator("th", { hasText: /Operational signal/i })
    ).toBeVisible();

    // ClickHouse cluster (id=14) shows needs-attention signal badge
    const chClusterRow = page.locator("tr[role='row']", { hasText: /Analytics ClickHouse Cluster/i });
    await expect(chClusterRow).toBeVisible();
    await expect(
      chClusterRow.locator("span.rounded-full", { hasText: /^Needs attention$/ })
    ).toBeVisible();

    // No standalone hostname/port columns
    const headerTexts = await page.locator("th").allTextContents();
    expect(headerTexts).not.toContain("Hostname");
    expect(headerTexts).not.toContain("Port");

    // Expand the ClickHouse cluster to see instances
    await chClusterRow.locator("button[aria-label*='Analytics ClickHouse Cluster']").click();

    // Instance rows now visible with hostname and port
    await expect(page.getByText("prod-ch-host-01.internal")).toBeVisible();
    await expect(page.getByText(":8123").first()).toBeVisible();

    // Instance role is localized (not raw "Replica")
    const replicaLabel = page.locator("tr[role='row']", { hasText: /prod-ch-host-02/ }).locator("td", { hasText: /Replica/i });
    await expect(replicaLabel).toBeVisible();

    // Critical instance shows clear reason with subject
    await expect(
      page.getByText(/Instance resource status is critical/)
    ).toBeVisible();
  });

  test("database search input renders and row click opens sheet", async ({
    page,
  }) => {
    await loginViaUI(page);

    await page.locator('a[href="/databases"]').first().click();
    await expect(page.locator("table")).toBeVisible();

    // Search input exists with correct placeholder
    const searchInput = page.getByPlaceholder(/host|port|role/i);
    await expect(searchInput).toBeVisible();

    // Type into search using real browser events (verifies no freeze)
    await searchInput.fill("mysql");
    await page.waitForTimeout(300);

    // Page should remain responsive — table still visible after client-side filter
    await expect(page.locator("table")).toBeVisible();

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(300);

    // Click a row to open the detail sheet
    const firstRow = page.locator("tbody tr[role='row']").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    // Sheet should open
    await expect(page.locator("[data-slot='sheet-content']")).toBeVisible({ timeout: 5000 });

    // Close sheet via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot='sheet-content']")).not.toBeVisible({ timeout: 3000 });
  });

  test("database engine filter dropdown opens and shows options", async ({
    page,
  }) => {
    await loginViaUI(page);

    await page.locator('a[href="/databases"]').first().click();
    await expect(page.locator("table")).toBeVisible();

    // Open engine filter dropdown
    const engineFilter = page.locator("[data-slot='multi-select-trigger']");
    await expect(engineFilter).toBeVisible();
    await engineFilter.click();

    // DropdownMenu content should appear
    const dropdownContent = page.locator("[data-slot='dropdown-menu-content']");
    await expect(dropdownContent).toBeVisible();

    // Should have at least one checkbox item visible
    const items = dropdownContent.locator("[data-slot='dropdown-menu-checkbox-item']");
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThanOrEqual(1);

    // Close dropdown by pressing Escape
    await page.keyboard.press("Escape");

    // Table should still be visible
    await expect(page.locator("table")).toBeVisible();
  });
});
