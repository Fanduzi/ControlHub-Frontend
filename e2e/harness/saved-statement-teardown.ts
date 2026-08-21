// input: Playwright test hooks, e2e/api.helpers getAuthToken, real query-target Saved Statement API
// output: guaranteed afterEach DELETE for Query Workbench-created Saved Statements (404 is success)
// pos: E2E cleanup seam for Saved Statements only; other fixture types stay unchanged
// note: if this file changes, update header and e2e/README.md
import { test, type Page } from "@playwright/test";

import { getAuthToken } from "../api.helpers";

export type SavedStatementIdentity = {
  id: number;
  targetResourceId: number;
};

/** Minimal fetch duck so teardown can be unit-tested without Playwright. */
export type SavedStatementTeardownFetch = (
  input: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

const created: SavedStatementIdentity[] = [];
const pendingRecords: Promise<void>[] = [];
const captureFailures: string[] = [];

const SAVED_STATEMENT_CREATE_PATH =
  /\/query-targets\/(\d+)\/saved-statements\/?$/;

function teardownApiBase(): string {
  return (
    process.env.CONTROLHUB_API_PROXY_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8081"
  );
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Extract the query-target id from a Saved Statement *create* URL.
 * Execute (`.../saved-statements/{id}/execute`) and item routes return null.
 */
export function savedStatementCreateTargetIdFromUrl(url: string): number | null {
  const match = pathnameOf(url).match(SAVED_STATEMENT_CREATE_PATH);
  if (!match) return null;
  const targetResourceId = Number(match[1]);
  if (!Number.isInteger(targetResourceId) || targetResourceId <= 0) return null;
  return targetResourceId;
}

export function isSavedStatementCreateResponse(response: {
  url(): string;
  status(): number;
  request(): { method(): string };
}): boolean {
  return (
    response.request().method() === "POST" &&
    response.status() === 201 &&
    savedStatementCreateTargetIdFromUrl(response.url()) !== null
  );
}

/**
 * Identify a create 201 so the row can be deleted later.
 * Execute POSTs must not match — those are not new rows.
 */
export function savedStatementCreateIdentityFromResponse(args: {
  method: string;
  url: string;
  status: number;
  body: unknown;
}): SavedStatementIdentity | null {
  if (args.method.toUpperCase() !== "POST" || args.status !== 201) return null;
  const targetFromUrl = savedStatementCreateTargetIdFromUrl(args.url);
  if (targetFromUrl === null) return null;
  if (args.body === null || typeof args.body !== "object") return null;
  const id = (args.body as { id?: unknown }).id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  const bodyTarget = (args.body as { targetResourceId?: unknown }).targetResourceId;
  const targetResourceId =
    typeof bodyTarget === "number" &&
    Number.isInteger(bodyTarget) &&
    bodyTarget > 0
      ? bodyTarget
      : targetFromUrl;
  return { id, targetResourceId };
}

/** DELETE 404 means the test already removed the row — that is teardown success. */
export function isSavedStatementTeardownSuccessStatus(status: number): boolean {
  return status === 404 || (status >= 200 && status < 300);
}

function sameIdentity(
  left: SavedStatementIdentity,
  right: SavedStatementIdentity,
): boolean {
  return left.id === right.id && left.targetResourceId === right.targetResourceId;
}

/** Record a create so afterEach can delete it even if a later assertion fails. */
export function trackSavedStatement(identity: SavedStatementIdentity): void {
  if (created.some((item) => sameIdentity(item, identity))) return;
  created.push(identity);
}

export async function recordSavedStatementCreateResponse(response: {
  url(): string;
  status(): number;
  request(): { method(): string };
  json(): Promise<unknown>;
}): Promise<SavedStatementIdentity> {
  const identity = savedStatementCreateIdentityFromResponse({
    method: response.request().method(),
    url: response.url(),
    status: response.status(),
    body: await response.json(),
  });
  if (!identity) {
    throw new Error(
      `Saved Statement create did not return a deletable id (${response.status()} ${response.url()})`,
    );
  }
  trackSavedStatement(identity);
  return identity;
}

/**
 * Click the create control only after the 201 waiter is armed, then record the id.
 * New UI create paths should use this so afterEach always has an identity.
 */
export async function submitSavedStatementCreate(
  page: Page,
  clickCreate: () => Promise<void>,
): Promise<SavedStatementIdentity> {
  const createResponse = page.waitForResponse((resp) =>
    isSavedStatementCreateResponse(resp),
  );
  await clickCreate();
  return recordSavedStatementCreateResponse(await createResponse);
}

export async function teardownSavedStatements(
  identities: readonly SavedStatementIdentity[],
  options: {
    apiBase: string;
    token: string;
    fetchImpl?: SavedStatementTeardownFetch;
  },
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const failures: string[] = [];
  for (const identity of identities) {
    const url = `${options.apiBase}/query-targets/${encodeURIComponent(String(identity.targetResourceId))}/saved-statements/${encodeURIComponent(String(identity.id))}`;
    try {
      const res = await fetchImpl(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${options.token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!isSavedStatementTeardownSuccessStatus(res.status)) {
        failures.push(
          `DELETE saved-statement ${identity.id} (target ${identity.targetResourceId}) returned ${res.status}`,
        );
      }
    } catch (error: unknown) {
      failures.push(
        `DELETE saved-statement ${identity.id} (target ${identity.targetResourceId}) threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `E2E teardown failed for Saved Statements:\n${failures.join("\n")}`,
    );
  }
}

/**
 * Call at the start of every Query Workbench describe that can create a
 * Saved Statement. Registers afterEach DELETE so cleanup is not stuck in a
 * happy-path `finally` that a failed assertion or test timeout can skip.
 */
export function installSavedStatementTeardown(): void {
  test.beforeEach(async ({ page }) => {
    created.length = 0;
    pendingRecords.length = 0;
    captureFailures.length = 0;
    page.on("response", (response) => {
      if (!isSavedStatementCreateResponse(response)) return;
      pendingRecords.push(
        recordSavedStatementCreateResponse(response).then(
          () => undefined,
          (error: unknown) => {
            captureFailures.push(
              error instanceof Error ? error.message : String(error),
            );
          },
        ),
      );
    });
  });

  test.afterEach(async () => {
    await Promise.all(pendingRecords);
    const identities = created.splice(0);
    const failures = captureFailures.splice(0);
    if (identities.length > 0) {
      try {
        await teardownSavedStatements(identities, {
          apiBase: teardownApiBase(),
          token: await getAuthToken(),
        });
      } catch (error: unknown) {
        failures.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  });
}
