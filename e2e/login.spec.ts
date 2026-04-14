import { expect, test } from "@playwright/test";

async function stubLoginApi(page: import("@playwright/test").Page) {
  await page.route("**/auth/login", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      email?: string;
      password?: string;
    };

    if (
      request.method() === "POST" &&
      body.email === "admin@example.com" &&
      body.password === "secret123"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test-token", role: "admin" }),
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid credentials" }),
    });
  });
}

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await stubLoginApi(page);
    // Force English locale
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("submits valid credentials and navigates to overview", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator("#email").fill("admin@example.com");
    await page.locator("#password").fill("secret123");
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });
    await expect(page.locator("nav")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill("admin@example.com");
    await page.locator("#password").fill("wrong-password");
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText("Invalid email or password"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
