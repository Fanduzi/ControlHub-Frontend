import { expect, type Page } from "@playwright/test";

import { loginViaUI } from "./auth";

/** Open the query workbench authenticated through the real BFF login form. */
export async function openQueryWorkbench(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "controlhub.locale",
      value: "en",
      domain: "localhost",
      path: "/",
    },
  ]);
  await loginViaUI(page);
  await page.locator('a[href="/query"]').first().click();
  await expect(page).toHaveURL(/\/query/);
}

/** CodeMirror editor content element. */
export function getEditor(page: Page) {
  return page.locator(".cm-content");
}

export async function getEditorContent(page: Page): Promise<string> {
  return (await getEditor(page).textContent()) ?? "";
}

export async function clearAndType(page: Page, text: string): Promise<void> {
  const editor = getEditor(page);
  await editor.click();
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+a" : "Control+a");
  await page.keyboard.type(text);
}

/** Whether the active target exposes an enabled Run control (i.e. is ready). */
export async function isRunEnabled(page: Page): Promise<boolean> {
  const run = page.getByRole("button", { name: /^(run|执行)$/i });
  if ((await run.count()) === 0) {
    return false;
  }
  return run.first().isEnabled().catch(() => false);
}

function getConnectionDialog(page: Page) {
  return page.getByRole("dialog", { name: /^(Connections|连接)$/ });
}

function getConnectionOpenTriggers(page: Page) {
  const desktopTrigger = page.getByRole("button", {
    name: /^(Open connections|打开连接)$/,
  });
  const mobileTrigger = page.getByRole("button", {
    name: /^(Open connections on mobile|打开连接（移动端）)$/,
  });
  return { desktopTrigger, mobileTrigger };
}

export async function openConnectionNavigator(page: Page) {
  const dialog = getConnectionDialog(page);
  if (await dialog.isVisible()) {
    return dialog;
  }
  const { desktopTrigger, mobileTrigger } = getConnectionOpenTriggers(page);
  await expect(desktopTrigger.or(mobileTrigger)).toBeVisible({ timeout: 5_000 });
  const trigger = (await desktopTrigger.isVisible())
    ? desktopTrigger
    : mobileTrigger;
  await trigger.click();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

function getConnectionTargetButtons(page: Page) {
  return getConnectionDialog(page).locator('ul button[aria-label]');
}

async function selectConnectionTarget(page: Page, index: number): Promise<void> {
  const dialog = await openConnectionNavigator(page);
  const target = getConnectionTargetButtons(page).nth(index);
  await expect(target).toBeVisible({ timeout: 5_000 });
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeEnabled({ timeout: 5_000 });
  const isCurrent = (await target.getAttribute("aria-current")) === "true";
  if (isCurrent) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    return;
  }
  await target.click();
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

async function waitForCommittedRunState(page: Page): Promise<boolean> {
  const run = page.getByRole("button", { name: /^(run|执行)$/i });
  const deadline = Date.now() + 5_000;
  let lastEnabled: boolean | null = null;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const enabled =
      (await run.count()) > 0 &&
      (await run.first().isEnabled().catch(() => false));
    if (lastEnabled === enabled) {
      stableSamples += 1;
      if (stableSamples >= 5) {
        return enabled;
      }
    } else {
      lastEnabled = enabled;
      stableSamples = 1;
    }
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * Select the probed ready target via the connection navigator and wait until
 * Run reflects the committed worksheet. Fails hard when the fixture has no
 * ready target — never silently skips.
 */
export async function ensureReadyTargetSelected(
  page: Page,
  readyTargetDisplayName: string,
  readyTargetResourceId: number,
): Promise<void> {
  if (await isRunEnabled(page)) {
    return;
  }
  await openConnectionNavigator(page);
  const buttons = getConnectionTargetButtons(page);
  await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
  const labels = await buttons.evaluateAll((bs) =>
    bs.map((b) => b.getAttribute("aria-label")),
  );
  const readyIndex = labels.indexOf(readyTargetDisplayName);
  if (readyIndex === -1) {
    throw new Error(
      `E2E fixture setup error: ready target "${readyTargetDisplayName}" not in connection navigator.`,
    );
  }
  await selectConnectionTarget(page, readyIndex);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("targetId"), {
      timeout: 5_000,
    })
    .toBe(String(readyTargetResourceId));
  const committed = await waitForCommittedRunState(page);
  if (!committed) {
    throw new Error(
      "E2E fixture setup error: ready target selected but Run never enabled.",
    );
  }
}
