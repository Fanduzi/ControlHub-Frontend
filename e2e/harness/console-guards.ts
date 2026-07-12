import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface ConsoleMessage {
  type: "error" | "warning";
  text: string;
}

export interface ConsoleGuardOptions {
  /** Patterns that match allowed console.error messages (dev noise only). */
  allowedErrors?: RegExp[];
  /** Patterns that match allowed console.warning messages (dev noise only). */
  allowedWarnings?: RegExp[];
}

/** Exact expected HTTP error for one-shot consumption (never a broad allowlist). */
export type ExpectedHttpError = {
  method: string;
  /** Full request URL; matching normalizes before equality. */
  url: string;
  status: number;
};

const NETWORK_ERROR_RE = /^(\S+)\s+(.+)\s+→\s+(\d+)$/;
const NETWORK_FAILURE_RE = /^(\S+)\s+(.+)\s+→\s+(ERR_\S+|net::ERR_\S+|Failed)$/i;

/**
 * Normalize a request URL for exact comparison: absolute URL, no hash,
 * no trailing slash on the pathname (except root).
 */
export function normalizeRequestUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.href;
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

/**
 * Collect HTTP 4xx/5xx responses and request-level connection failures
 * (e.g. ERR_CONNECTION_REFUSED). Nothing is suppressed by default.
 * Intentional failures must be removed one-shot via takeExpectedNetworkError
 * after the test asserts the response and UI — never via a broad allowlist.
 */
export function collectNetworkErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) {
      errors.push(`${res.request().method()} ${res.url()} → ${status}`);
    }
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const errorText = failure?.errorText ?? "Failed";
    // AbortController cleanup / navigation cancellation is not a product failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|net::ERR_ABORTED/i.test(errorText)) {
      return;
    }
    // Connection-level failures (e.g. ERR_CONNECTION_REFUSED) have no HTTP status.
    errors.push(`${request.method()} ${request.url()} → ${errorText}`);
  });

  return errors;
}

/**
 * Remove exactly one network error matching method + full normalized URL + status.
 * Throws if zero matches — the intentional error must be present.
 * Leaves every other error so a second 400 / other target / 403 / 500 still fails.
 */
export function takeExpectedNetworkError(
  errors: string[],
  expected: ExpectedHttpError,
): string[] {
  const expectedUrl = normalizeRequestUrl(expected.url);
  const idx = errors.findIndex((message) => {
    const match = message.match(NETWORK_ERROR_RE);
    if (!match) return false;
    const [, method, url, statusText] = match;
    return (
      method === expected.method &&
      normalizeRequestUrl(url!) === expectedUrl &&
      Number(statusText) === expected.status
    );
  });

  if (idx === -1) {
    throw new Error(
      `Expected exactly one network error ${expected.method} ${expectedUrl} → ${expected.status}, ` +
        `but none matched. Observed:\n${errors.length === 0 ? "(none)" : errors.join("\n")}`,
    );
  }

  return errors.filter((_, i) => i !== idx);
}

/**
 * Remove exactly one browser console error that echoes an HTTP status code
 * (Chromium: "Failed to load resource: the server responded with a status of 400").
 * One-shot only — a second console error with the same status still fails assertClean.
 */
export function takeExpectedConsoleStatusError(
  messages: ConsoleMessage[],
  status: number,
): ConsoleMessage[] {
  const statusPattern = new RegExp(`status of ${status}\\b`);
  const idx = messages.findIndex(
    (m) => m.type === "error" && statusPattern.test(m.text),
  );

  if (idx === -1) {
    // Console echo is environment-dependent; if the network error was taken and
    // the UI assertion passed, a missing console twin is acceptable. Callers
    // that require the console twin should assert separately.
    return messages;
  }

  return messages.filter((_, i) => i !== idx);
}

/** Parse a collected network error message into parts, or null if malformed. */
export function parseNetworkErrorMessage(
  message: string,
): { method: string; url: string; status: number } | { method: string; url: string; failure: string } | null {
  const statusMatch = message.match(NETWORK_ERROR_RE);
  if (statusMatch) {
    return {
      method: statusMatch[1]!,
      url: statusMatch[2]!,
      status: Number(statusMatch[3]),
    };
  }
  const failureMatch = message.match(NETWORK_FAILURE_RE);
  if (failureMatch) {
    return {
      method: failureMatch[1]!,
      url: failureMatch[2]!,
      failure: failureMatch[3]!,
    };
  }
  return null;
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
