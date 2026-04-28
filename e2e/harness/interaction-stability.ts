import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const ACCENT_STORAGE_KEY = "controlhub.accent";
export const DEFAULT_BLUE_PRIMARY = "lab(45.2565% -10.9423 -37.8452)";

export const BLANK_CLICK_X = 20;
export const BLANK_CLICK_Y = 20;

export const OVERLAY_SELECTORS = [
  { name: "dialog", selector: '[role="dialog"]' },
  { name: "sheet-overlay", selector: '[data-slot="sheet-overlay"]' },
  { name: "inert", selector: "[inert]" },
] as const;

export function isDefaultBluePrimary(colorValue: string): boolean {
  return colorValue === DEFAULT_BLUE_PRIMARY;
}

export async function setAccentToPurple(page: Page): Promise<void> {
  await page.evaluate((key) => {
    window.localStorage.setItem(key, "purple");
    document.documentElement.dataset.accent = "purple";
  }, ACCENT_STORAGE_KEY);
}

export async function assertAccentIsPurple(page: Page): Promise<void> {
  const accent = await page.evaluate(
    () => document.documentElement.dataset.accent,
  );
  expect(accent, "data-accent should be purple").toBe("purple");

  const primaryColor = await page.evaluate(() => {
    const style = window.getComputedStyle(document.documentElement);
    return style.getPropertyValue("--primary").trim();
  });
  expect(
    isDefaultBluePrimary(primaryColor),
    "--primary should not be default blue",
  ).toBe(false);
}

export async function assertNoResidualOverlays(page: Page): Promise<void> {
  const dialogs = await page.locator('[role="dialog"]').count();
  expect(dialogs, "No [role=dialog] residue").toBe(0);

  const overlays = await page.locator('[data-slot="sheet-overlay"]').count();
  expect(overlays, "No sheet-overlay residue").toBe(0);

  const inertElements = await page.locator("[inert]").count();
  expect(inertElements, "No [inert] residue").toBe(0);
}

export async function assertRowClickOpensSheet(page: Page): Promise<void> {
  const table = page.locator("table").first();
  await expect(table).toBeVisible();

  const row = table.locator("tbody tr").first();
  await expect(row).toBeVisible();

  await row.click();

  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
}

export async function assertBlankClickClosesSheet(page: Page): Promise<void> {
  await page.mouse.click(BLANK_CLICK_X, BLANK_CLICK_Y);

  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).not.toBeVisible({ timeout: 5_000 });
  await assertNoResidualOverlays(page);
}

export async function assertMultiSelectOpens(page: Page): Promise<void> {
  const trigger = page
    .locator('[data-slot="multi-select-trigger"]')
    .first();
  await expect(trigger).toBeVisible();

  await trigger.click();

  const menuContent = page
    .locator('[data-slot="dropdown-menu-content"]')
    .first();
  await expect(menuContent).toBeVisible({ timeout: 5_000 });

  await page.keyboard.press("Escape");
  await expect(menuContent).not.toBeVisible({ timeout: 3_000 });
}
