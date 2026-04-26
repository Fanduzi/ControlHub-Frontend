import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

interface ConsoleGuardOptions {
  allowPatterns?: RegExp[];
}

export function collectConsoleErrors(
  page: Page,
  opts: ConsoleGuardOptions = {}
): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      const allowed = opts.allowPatterns?.some((p) => p.test(text));
      if (!allowed) {
        errors.push(text);
      }
    }
  });
  return errors;
}

export function collectNetworkErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) {
      errors.push(`${res.request().method()} ${res.url()} → ${status}`);
    }
  });
  return errors;
}

export function assertNoErrors(
  consoleErrors: string[],
  networkErrors: string[]
): void {
  if (consoleErrors.length > 0) {
    console.error("Console errors:\n" + consoleErrors.join("\n"));
  }
  if (networkErrors.length > 0) {
    console.error("Network errors:\n" + networkErrors.join("\n"));
  }
  expect(consoleErrors, "No console errors").toHaveLength(0);
  expect(networkErrors, "No 4xx/5xx network responses").toHaveLength(0);
}
