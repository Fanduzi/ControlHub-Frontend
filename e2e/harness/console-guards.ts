import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface ConsoleMessage {
  type: "error" | "warning";
  text: string;
}

export interface ConsoleGuardOptions {
  /** Patterns that match allowed console.error messages */
  allowedErrors?: RegExp[];
  /** Patterns that match allowed console.warning messages */
  allowedWarnings?: RegExp[];
}

export function isAllowedConsoleMessage(
  type: "error" | "warning",
  text: string,
  opts: ConsoleGuardOptions,
): boolean {
  const allowList = type === "error" ? opts.allowedErrors : opts.allowedWarnings;
  return allowList?.some((p) => p.test(text)) ?? false;
}

export function collectConsoleMessages(
  page: Page,
  opts: ConsoleGuardOptions = {}
): ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;

    const text = msg.text();
    const allowed = isAllowedConsoleMessage(type, text, opts);
    if (!allowed) {
      messages.push({ type, text });
    }
  });
  return messages;
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

export function assertClean(
  consoleMessages: ConsoleMessage[],
  networkErrors: string[]
): void {
  const errors = consoleMessages.filter((m) => m.type === "error");
  const warnings = consoleMessages.filter((m) => m.type === "warning");

  if (errors.length > 0) {
    console.error("Console errors:\n" + errors.map((e) => e.text).join("\n"));
  }
  if (warnings.length > 0) {
    console.error(
      "Unexpected console warnings:\n" +
        warnings.map((w) => w.text).join("\n")
    );
  }
  if (networkErrors.length > 0) {
    console.error("Network errors:\n" + networkErrors.join("\n"));
  }

  expect(errors, "No console errors").toHaveLength(0);
  expect(warnings, "No unexpected console warnings").toHaveLength(0);
  expect(networkErrors, "No 4xx/5xx network responses").toHaveLength(0);
}
