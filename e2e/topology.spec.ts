import { expect, test } from "@playwright/test";

import {
  archiveTestResource,
  createTestRelation,
  createTestResource,
  defaultResourceInput,
  deleteTestRelation,
  getAuthToken,
  testResourceName,
} from "./api.helpers";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Resource topology view", () => {
  let token: string;
  let rootResourceId: number;
  let relatedResourceId: number;
  let relationId: number;
  let rootResourceName: string;
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    token = await getAuthToken();

    rootResourceName = testResourceName("topo");

    const rootResource = await createTestResource(
      token,
      defaultResourceInput({ name: rootResourceName }),
    );
    rootResourceId = rootResource.id;

    const relatedResource = await createTestResource(
      token,
      defaultResourceInput({ name: testResourceName("topo") }),
    );
    relatedResourceId = relatedResource.id;

    const relation = await createTestRelation(token, rootResourceId, {
      toResourceId: relatedResourceId,
      relationType: "depends_on",
    });
    relationId = relation.id;
  });

  test.afterAll(async () => {
    if (relationId) {
      try {
        await deleteTestRelation(token, relationId);
      } catch {
        // Best-effort cleanup
      }
    }
    if (rootResourceId) {
      await archiveTestResource(token, rootResourceId);
    }
    if (relatedResourceId) {
      await archiveTestResource(token, relatedResourceId);
    }
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

  test("topology section renders on resource detail page with graph", async ({
    page,
  }) => {
    // Navigate directly to the API-created resource detail page
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page).toHaveURL(/\/resources\/\d+$/);

    // Verify the topology section exists
    await expect(page.getByText("Resource topology").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify topology graph is rendered
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify at least one topology node is visible (the root at minimum)
    const topologyNodes = page.locator("[data-testid^='topology-node-']");
    await expect(topologyNodes.first()).toBeVisible({ timeout: 10_000 });
    const nodeCount = await topologyNodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);
  });

  test("topology depth selector updates graph", async ({ page }) => {
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify depth and direction selectors exist
    await expect(page.getByTestId("topology-depth-select").first()).toBeVisible();
    await expect(page.getByTestId("topology-direction-select").first()).toBeVisible();

    // Change depth to 2
    await page.getByTestId("topology-depth-select").first().click();
    await page.getByTestId("topology-depth-2").click();

    // Graph should reload and still be visible
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology direction selector sends direction param", async ({ page }) => {
    // Use the related resource which has the root as an upstream neighbor
    // so "upstream" direction will return at least one node
    await page.goto(`/resources/${relatedResourceId}`);
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Switch direction to upstream — related resource depends_on root,
    // so upstream direction should find the root
    await page.getByTestId("topology-direction-select").first().click();
    await page.getByTestId("topology-direction-upstream").click();

    // Graph should reload and still be visible (root is upstream)
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology expand button opens expanded overlay", async ({ page }) => {
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Expand button should be visible when graph has edges
    const expandButton = page.getByTestId("topology-expand-button").first();
    await expect(expandButton).toBeVisible();

    // Click expand
    await expandButton.click();

    // Expanded overlay should appear
    await expect(page.getByTestId("topology-expanded-overlay").first()).toBeVisible({
      timeout: 5_000,
    });

    // Collapse button should be visible in the overlay header
    const collapseButton = page.getByTestId("topology-exit-expanded").first();
    await expect(collapseButton).toBeVisible();

    // Click collapse to close
    await collapseButton.click();
    await expect(page.getByTestId("topology-expanded-overlay")).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("topology URL sync for depth on resource detail page", async ({
    page,
  }) => {
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Change depth to 2
    await page.getByTestId("topology-depth-select").first().click();
    await page.getByTestId("topology-depth-2").click();

    // URL should contain topologyDepth=2
    await expect(page).toHaveURL(/topologyDepth=2/, { timeout: 5_000 });

    // Graph should still be visible after URL update
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology nodes have role data attribute", async ({ page }) => {
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Every topology node should have a data-topology-role attribute
    const topologyNodes = page.locator("[data-testid^='topology-node-']");
    await expect(topologyNodes.first()).toBeVisible({ timeout: 10_000 });

    const firstNode = topologyNodes.first();
    const role = await firstNode.getAttribute("data-topology-role");
    // Role should be a non-empty string (generic for non-database, or semantic role)
    expect(role).toBeTruthy();
  });

  test("topology renders in detail sheet with compact view", async ({
    page,
  }) => {
    // Go to resources list and find our test resource
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Search for our test resource by name
    const searchInput = page
      .locator("main")
      .getByPlaceholder("Search resource, owner, hostname, IP, or ID");
    await searchInput.fill(rootResourceName);

    // Wait for filtered results
    await expect(
      page.locator("table").first().locator("tbody tr").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the row for our test resource
    await page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Verify topology section exists inside the sheet
    await expect(sheet.getByText("Resource topology").first()).toBeVisible({
      timeout: 10_000,
    });

    // Topology graph should render in compact mode
    await expect(sheet.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test.afterEach(() => {
    assertClean(consoleMessages, networkErrors);
  });
});
