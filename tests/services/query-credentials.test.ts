import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { apiClient } from "@/services/api-client";
import {
  deleteQueryCredential,
  getQueryCredential,
  saveQueryCredential,
} from "@/services/query-credentials";
import * as queryCredentialsModule from "@/services/query-credentials";

const mockApiClient = vi.mocked(apiClient);

/** Safely extract the parsed JSON body from the first apiClient PUT call. */
function firstCallBody(): Record<string, unknown> {
  const call = mockApiClient.mock.calls[0];
  expect(call).toBeDefined();
  const init = call![1] as Record<string, unknown> | undefined;
  expect(init).toBeDefined();
  return JSON.parse(init!.body as string);
}

describe("getQueryCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/:id/credential", async () => {
    mockApiClient.mockResolvedValueOnce({
      resourceId: 42,
      configured: false,
      engine: "mysql",
      credentialRef: "",
      enabled: false,
      environmentPolicy: "disabled",
      runtimeStatus: "missing_metadata",
      executionEligible: false,
      message: "No read-only credential reference is configured.",
    });

    await getQueryCredential(42);

    expect(mockApiClient).toHaveBeenCalledWith("/query-targets/42/credential");
  });

  it("returns the credential status response unchanged", async () => {
    const response = {
      resourceId: 42,
      configured: true,
      engine: "mysql",
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "non_prod_only" as const,
      runtimeStatus: "secret_resolved" as const,
      executionEligible: true,
      message: "Read-only credential is configured and bound to this target.",
    };
    mockApiClient.mockResolvedValueOnce(response);

    await expect(getQueryCredential(42)).resolves.toEqual(response);
  });
});

describe("saveQueryCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PUT /query-targets/:id/credential with the correct body", async () => {
    mockApiClient.mockResolvedValueOnce({
      resourceId: 42,
      configured: true,
      engine: "mysql",
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "non_prod_only",
      runtimeStatus: "secret_resolved",
      executionEligible: true,
      message: "ok",
    });

    await saveQueryCredential(42, {
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    expect(mockApiClient).toHaveBeenCalledWith("/query-targets/42/credential", {
      method: "PUT",
      body: JSON.stringify({
        credentialRef: "ORDER_MYSQL_RO",
        enabled: true,
        environmentPolicy: "non_prod_only",
      }),
    });
  });

  it("includes confirmAllEnvironments when provided", async () => {
    mockApiClient.mockResolvedValueOnce({
      resourceId: 42,
      configured: true,
      engine: "mysql",
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "all_environments",
      runtimeStatus: "secret_resolved",
      executionEligible: true,
      message: "ok",
    });

    await saveQueryCredential(42, {
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "all_environments",
      confirmAllEnvironments: true,
    });

    const callBody = firstCallBody();
    expect(callBody.confirmAllEnvironments).toBe(true);
  });

  it("request body never contains actorUserId", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("actorUserId");
  });

  it("request body never contains dsn", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("dsn");
  });

  it("request body never contains password", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("password");
  });

  it("request body never contains host", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("host");
  });

  it("request body never contains port", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("port");
  });

  it("request body never contains engine", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("engine");
  });

  it("drops extra fields from the input object (whitelist body)", async () => {
    mockApiClient.mockResolvedValueOnce({});

    const pollutedInput = {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only" as const,
      actorUserId: 999,
      dsn: "mysql://root:secret@db:3306/prod",
      password: "hunter2",
      host: "db.internal",
      port: 3306,
      engine: "mysql",
      unknownField: "should not appear",
    };

    await saveQueryCredential(42, pollutedInput);

    const callBody = firstCallBody();
    // Whitelist: only these four keys may appear.
    expect(Object.keys(callBody).sort()).toEqual([
      "credentialRef",
      "enabled",
      "environmentPolicy",
    ]);
    // Explicitly verify the dangerous fields are stripped.
    expect(callBody).not.toHaveProperty("actorUserId");
    expect(callBody).not.toHaveProperty("dsn");
    expect(callBody).not.toHaveProperty("password");
    expect(callBody).not.toHaveProperty("host");
    expect(callBody).not.toHaveProperty("port");
    expect(callBody).not.toHaveProperty("engine");
    expect(callBody).not.toHaveProperty("unknownField");
  });

  it("includes confirmAllEnvironments in the whitelist body only when explicitly provided", async () => {
    mockApiClient.mockResolvedValueOnce({});

    const pollutedInput = {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "all_environments" as const,
      confirmAllEnvironments: true,
      actorUserId: 42,
      dsn: "mysql://...",
    };

    await saveQueryCredential(42, pollutedInput);

    const callBody = firstCallBody();
    expect(callBody).toHaveProperty("confirmAllEnvironments", true);
    expect(callBody).not.toHaveProperty("actorUserId");
    expect(callBody).not.toHaveProperty("dsn");
    // Only the four allowed keys.
    expect(Object.keys(callBody).sort()).toEqual([
      "confirmAllEnvironments",
      "credentialRef",
      "enabled",
      "environmentPolicy",
    ]);
  });

  it("omits confirmAllEnvironments when input does not provide it", async () => {
    mockApiClient.mockResolvedValueOnce({});

    await saveQueryCredential(42, {
      credentialRef: "TEST_REF",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    const callBody = firstCallBody();
    expect(callBody).not.toHaveProperty("confirmAllEnvironments");
  });
});

describe("deleteQueryCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls DELETE /query-targets/:id/credential", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);

    await deleteQueryCredential(42);

    expect(mockApiClient).toHaveBeenCalledWith("/query-targets/42/credential", {
      method: "DELETE",
    });
  });
});

describe("query-credentials module exports", () => {
  it("exports only the three credential service functions", () => {
    const exportedKeys = Object.keys(queryCredentialsModule).sort();
    expect(exportedKeys).toEqual([
      "deleteQueryCredential",
      "getQueryCredential",
      "saveQueryCredential",
    ]);
  });

  it("never exports a DSN or password helper", () => {
    expect(queryCredentialsModule).not.toHaveProperty("getDSN");
    expect(queryCredentialsModule).not.toHaveProperty("getPassword");
    expect(queryCredentialsModule).not.toHaveProperty("dsn");
    expect(queryCredentialsModule).not.toHaveProperty("password");
  });
});
