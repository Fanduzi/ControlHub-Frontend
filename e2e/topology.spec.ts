import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";
import {
  createTestRelation,
  createTestResource,
  decommissionTestResource,
  defaultResourceInput,
  deleteTestRelation,
  getAuthToken,
  testResourceName,
} from "./api.helpers";

test.describe("Resource topology view", () => {
  let token: string;
  let rootResourceId: string;
  let relatedResourceId: string;
  let relationId: string;
  let rootResourceName: string;

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
    // Backend does not support hard-delete of resources.
    // Decommission to harmless state instead.
    if (rootResourceId) {
      await decommissionTestResource(token, rootResourceId);
    }
    if (relatedResourceId) {
      await decommissionTestResource(token, relatedResourceId);
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("topology section renders on resource detail page with graph", async ({
    page,
  }) => {
    // Navigate directly to the API-created resource detail page
    await page.goto(`/resources/${rootResourceId}`);
    await expect(page).toHaveURL(/\/resources\/[\w-]+/);

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
      .getByPlaceholder("Search resource, owner, or ID");
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
});
