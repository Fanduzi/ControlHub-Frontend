// input: vitest, e2e/harness/saved-statement-teardown
// output: unit tests for Saved Statement E2E teardown — 404 is success, other errors fail
// pos: locks the Query Workbench cleanup contract so leftover rows cannot hide behind swallowed errors
// note: if this file changes, update header and tests/e2e-harness/README.md
import { describe, expect, it, vi } from "vitest";

import {
  isSavedStatementCreateResponse,
  isSavedStatementTeardownSuccessStatus,
  savedStatementCreateIdentityFromResponse,
  savedStatementCreateTargetIdFromUrl,
  teardownSavedStatements,
  type SavedStatementTeardownFetch,
} from "../../e2e/harness/saved-statement-teardown";

function jsonResponse(args: {
  method: string;
  url: string;
  status: number;
}): {
  url(): string;
  status(): number;
  request(): { method(): string };
} {
  return {
    url: () => args.url,
    status: () => args.status,
    request: () => ({ method: () => args.method }),
  };
}

describe("savedStatementCreateTargetIdFromUrl", () => {
  it("reads the target id from a create URL, including the BFF proxy prefix", () => {
    expect(
      savedStatementCreateTargetIdFromUrl(
        "http://localhost:3100/api/proxy/query-targets/12/saved-statements",
      ),
    ).toBe(12);
    expect(
      savedStatementCreateTargetIdFromUrl(
        "http://localhost:8081/query-targets/12/saved-statements/",
      ),
    ).toBe(12);
  });

  it("does not treat execute or item routes as creates — those are not new rows to clean up", () => {
    expect(
      savedStatementCreateTargetIdFromUrl(
        "http://localhost:3100/api/proxy/query-targets/12/saved-statements/44/execute",
      ),
    ).toBeNull();
    expect(
      savedStatementCreateTargetIdFromUrl(
        "http://localhost:8081/query-targets/12/saved-statements/44",
      ),
    ).toBeNull();
  });
});

describe("savedStatementCreateIdentityFromResponse", () => {
  const createUrl =
    "http://localhost:3100/api/proxy/query-targets/9/saved-statements";

  it("records id and target from a 201 create body so afterEach can DELETE", () => {
    expect(
      savedStatementCreateIdentityFromResponse({
        method: "POST",
        url: createUrl,
        status: 201,
        body: { id: 44, targetResourceId: 9 },
      }),
    ).toEqual({ id: 44, targetResourceId: 9 });
  });

  it("falls back to the URL target when the body omits targetResourceId", () => {
    expect(
      savedStatementCreateIdentityFromResponse({
        method: "POST",
        url: createUrl,
        status: 201,
        body: { id: 44 },
      }),
    ).toEqual({ id: 44, targetResourceId: 9 });
  });

  it("ignores execute POSTs even if status is 201 — deleting would hit the wrong resource", () => {
    expect(
      savedStatementCreateIdentityFromResponse({
        method: "POST",
        url: "http://localhost:3100/api/proxy/query-targets/9/saved-statements/44/execute",
        status: 201,
        body: { id: 44, targetResourceId: 9 },
      }),
    ).toBeNull();
  });

  it("ignores non-201 and missing id so a failed create is not tracked as a live row", () => {
    expect(
      savedStatementCreateIdentityFromResponse({
        method: "POST",
        url: createUrl,
        status: 400,
        body: { id: 44, targetResourceId: 9 },
      }),
    ).toBeNull();
    expect(
      savedStatementCreateIdentityFromResponse({
        method: "POST",
        url: createUrl,
        status: 201,
        body: { name: "no-id" },
      }),
    ).toBeNull();
  });
});

describe("isSavedStatementCreateResponse", () => {
  it("matches only POST 201 create URLs", () => {
    expect(
      isSavedStatementCreateResponse(
        jsonResponse({
          method: "POST",
          url: "http://localhost:8081/query-targets/3/saved-statements",
          status: 201,
        }),
      ),
    ).toBe(true);
    expect(
      isSavedStatementCreateResponse(
        jsonResponse({
          method: "POST",
          url: "http://localhost:8081/query-targets/3/saved-statements/8/execute",
          status: 201,
        }),
      ),
    ).toBe(false);
    expect(
      isSavedStatementCreateResponse(
        jsonResponse({
          method: "GET",
          url: "http://localhost:8081/query-targets/3/saved-statements",
          status: 201,
        }),
      ),
    ).toBe(false);
  });
});

describe("isSavedStatementTeardownSuccessStatus", () => {
  it("treats 2xx and 404 as success because the row is already gone after a happy-path UI delete", () => {
    expect(isSavedStatementTeardownSuccessStatus(200)).toBe(true);
    expect(isSavedStatementTeardownSuccessStatus(204)).toBe(true);
    expect(isSavedStatementTeardownSuccessStatus(404)).toBe(true);
  });

  it("treats any other status as a visible teardown failure so leftovers cannot hide", () => {
    expect(isSavedStatementTeardownSuccessStatus(401)).toBe(false);
    expect(isSavedStatementTeardownSuccessStatus(403)).toBe(false);
    expect(isSavedStatementTeardownSuccessStatus(500)).toBe(false);
  });
});

describe("teardownSavedStatements", () => {
  const row = { id: 44, targetResourceId: 9 };

  it("DELETEs each tracked id and accepts 204 or 404", async () => {
    const fetchImpl = vi.fn<SavedStatementTeardownFetch>(async (url, init) => {
      expect(url).toBe(
        "http://localhost:8081/query-targets/9/saved-statements/44",
      );
      expect(init.method).toBe("DELETE");
      expect(
        (init.headers as Record<string, string>).Authorization,
      ).toBe("Bearer test-token");
      return { ok: true, status: 204 };
    });

    await teardownSavedStatements([row], {
      apiBase: "http://localhost:8081",
      token: "test-token",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    fetchImpl.mockResolvedValueOnce({ ok: false, status: 404 });
    await teardownSavedStatements([row], {
      apiBase: "http://localhost:8081",
      token: "test-token",
      fetchImpl,
    });
  });

  it("does not fetch when nothing was created", async () => {
    const fetchImpl = vi.fn<SavedStatementTeardownFetch>();
    await teardownSavedStatements([], {
      apiBase: "http://localhost:8081",
      token: "test-token",
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails the run on non-404 teardown errors instead of swallowing them", async () => {
    const fetchImpl = vi.fn<SavedStatementTeardownFetch>(async () => ({
      ok: false,
      status: 500,
    }));

    await expect(
      teardownSavedStatements([row], {
        apiBase: "http://localhost:8081",
        token: "test-token",
        fetchImpl,
      }),
    ).rejects.toThrow(/returned 500/);
  });

  it("fails visibly when DELETE throws (network/timeout), not only on HTTP status", async () => {
    const fetchImpl = vi.fn<SavedStatementTeardownFetch>(async () => {
      throw new Error("socket hang up");
    });

    await expect(
      teardownSavedStatements([row], {
        apiBase: "http://localhost:8081",
        token: "test-token",
        fetchImpl,
      }),
    ).rejects.toThrow(/socket hang up/);
  });

  it("attempts every tracked row and reports each non-404 failure", async () => {
    const fetchImpl = vi.fn<SavedStatementTeardownFetch>(async (url) => {
      if (url.endsWith("/saved-statements/1")) return { ok: false, status: 404 };
      if (url.endsWith("/saved-statements/2")) return { ok: false, status: 500 };
      throw new Error("ECONNRESET");
    });

    await expect(
      teardownSavedStatements(
        [
          { id: 1, targetResourceId: 9 },
          { id: 2, targetResourceId: 9 },
          { id: 3, targetResourceId: 9 },
        ],
        {
          apiBase: "http://localhost:8081",
          token: "test-token",
          fetchImpl,
        },
      ),
    ).rejects.toThrow(/returned 500[\s\S]*ECONNRESET/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
