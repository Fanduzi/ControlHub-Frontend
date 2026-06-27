import { describe, expect, it } from "vitest";

import type {
  CredentialOperationRow,
  CredentialFilterState,
} from "@/lib/query-credential-operations";
import {
  buildCredentialPutBody,
  buildOperationRows,
  collectClusters,
  collectEnvironments,
  collectEngines,
  collectRuntimeStatuses,
  deriveCoverageCounts,
  filterCredentialRows,
  groupOperationRows,
  isTargetSelectable,
} from "@/lib/query-credential-operations";
import type { QueryCredentialStatusResponse } from "@/types/query-credential";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function credentialResponse(
  overrides: Partial<QueryCredentialStatusResponse> = {},
): QueryCredentialStatusResponse {
  return {
    resourceId: 42,
    configured: false,
    engine: "mysql",
    credentialRef: "",
    enabled: false,
    environmentPolicy: "disabled",
    runtimeStatus: "missing_metadata",
    executionEligible: false,
    message: "No read-only credential reference is configured.",
    ...overrides,
  };
}

function mysqlTarget(overrides: Partial<QueryTarget> = {}): QueryTarget {
  return buildQueryTarget({
    resourceId: 42,
    displayName: "Order MySQL",
    resourceName: "order-mysql",
    connectionContext: {
      engine: "mysql",
      host: "order-db.internal",
      port: 3306,
      environment: "Production",
      owner: "DBA Team",
      clusterName: "Order Cluster",
    },
    readiness: "ready",
    missingFields: [],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// isTargetSelectable
// ---------------------------------------------------------------------------

describe("isTargetSelectable", () => {
  it("selects a complete MySQL target", () => {
    const target = mysqlTarget();
    const result = isTargetSelectable(target);
    expect(result.selectable).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("selects a TiDB target", () => {
    const target = mysqlTarget({
      connectionContext: { engine: "tidb", host: "tidb.internal", port: 4000, environment: "Production", owner: "DBA", clusterName: "TiDB Cluster" },
    });
    const result = isTargetSelectable(target);
    expect(result.selectable).toBe(true);
  });

  it("rejects an unsupported engine (ClickHouse)", () => {
    const target = mysqlTarget({
      connectionContext: { engine: "clickhouse", host: "ch.internal", port: 8123, environment: "Production", owner: "DBA", clusterName: "CH Cluster" },
    });
    const result = isTargetSelectable(target);
    expect(result.selectable).toBe(false);
    expect(result.reason).toBe("unsupported_engine");
  });

  it("rejects a target with missing connection", () => {
    const target = mysqlTarget({
      readiness: "missing_connection",
      missingFields: ["host", "port"],
    });
    const result = isTargetSelectable(target);
    expect(result.selectable).toBe(false);
    expect(result.reason).toBe("incomplete_connection");
  });

  it("rejects a target with missing host field", () => {
    const target = mysqlTarget({
      missingFields: ["host"],
    });
    const result = isTargetSelectable(target);
    expect(result.selectable).toBe(false);
    expect(result.reason).toBe("incomplete_connection");
  });
});

// ---------------------------------------------------------------------------
// deriveCoverageCounts
// ---------------------------------------------------------------------------

describe("deriveCoverageCounts", () => {
  it("counts total targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1 } as CredentialOperationRow,
      { resourceId: 2 } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.total).toBe(2);
  });

  it("counts ready (secret_resolved) targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "secret_resolved" } as CredentialOperationRow,
      { resourceId: 2, runtimeStatus: "missing_metadata" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.ready).toBe(1);
  });

  it("counts missing_metadata targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "missing_metadata" } as CredentialOperationRow,
      { resourceId: 2, runtimeStatus: "missing_metadata" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.missingMetadata).toBe(2);
  });

  it("counts secret_missing targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "secret_missing" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.secretMissing).toBe(1);
  });

  it("counts binding_mismatch and invalid_ref under bindingMismatch", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "binding_mismatch" } as CredentialOperationRow,
      { resourceId: 2, runtimeStatus: "invalid_ref" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.bindingMismatch).toBe(2);
  });

  it("counts policy_blocked targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "policy_blocked" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.policyBlocked).toBe(1);
  });

  it("counts disabled targets", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "disabled" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.disabled).toBe(1);
  });

  it("counts unsupported_target and incomplete_connection under unsupportedOrIncomplete", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "unsupported_target" } as CredentialOperationRow,
      { resourceId: 2, runtimeStatus: "incomplete_connection" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.unsupportedOrIncomplete).toBe(2);
  });

  it("counts fetch_pending and fetch_error separately", () => {
    const rows: CredentialOperationRow[] = [
      { resourceId: 1, runtimeStatus: "fetch_pending" } as CredentialOperationRow,
      { resourceId: 2, runtimeStatus: "fetch_error" } as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.fetchPending).toBe(1);
    expect(counts.fetchError).toBe(1);
  });

  it("unknown statuses fall under disabled count", () => {
    const rows = [
      { resourceId: 1, runtimeStatus: "some_future_status" } as unknown as CredentialOperationRow,
    ];
    const counts = deriveCoverageCounts(rows);
    expect(counts.disabled).toBe(1);
    expect(counts.ready).toBe(0);
  });

  it("returns zero counts for empty rows", () => {
    const counts = deriveCoverageCounts([]);
    expect(counts.total).toBe(0);
    expect(counts.ready).toBe(0);
    expect(counts.missingMetadata).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildOperationRows
// ---------------------------------------------------------------------------

describe("buildOperationRows", () => {
  it("merges targets with credential responses", () => {
    const targets = [mysqlTarget({ resourceId: 42 })];
    const credentialMap = new Map([
      [42, credentialResponse({ runtimeStatus: "secret_resolved" })],
    ]);
    const errorMap = new Map<number, string>();

    const rows = buildOperationRows(targets, credentialMap, errorMap);
    expect(rows).toHaveLength(1);
    expect(rows[0].runtimeStatus).toBe("secret_resolved");
    expect(rows[0].credential?.runtimeStatus).toBe("secret_resolved");
    expect(rows[0].fetchError).toBeNull();
  });

  it("marks missing credential as fetch_pending", () => {
    const targets = [mysqlTarget({ resourceId: 42 })];
    const credentialMap = new Map<number, QueryCredentialStatusResponse | null>();
    const errorMap = new Map<number, string>();

    const rows = buildOperationRows(targets, credentialMap, errorMap);
    expect(rows[0].runtimeStatus).toBe("fetch_pending");
    expect(rows[0].credential).toBeNull();
  });

  it("marks errored credential as fetch_error", () => {
    const targets = [mysqlTarget({ resourceId: 42 })];
    const credentialMap = new Map<number, QueryCredentialStatusResponse | null>([
      [42, null],
    ]);
    const errorMap = new Map<number, string>([[42, "Network error"]]);

    const rows = buildOperationRows(targets, credentialMap, errorMap);
    expect(rows[0].runtimeStatus).toBe("fetch_error");
    expect(rows[0].fetchError).toBe("Network error");
  });

  it("marks unsupported engine targets as not selectable", () => {
    const targets = [
      buildQueryTarget({
        resourceId: 99,
        connectionContext: {
          engine: "clickhouse",
          host: "ch.internal",
          port: 8123,
          environment: "Production",
          owner: "DBA",
          clusterName: "CH Cluster",
        },
      }),
    ];
    const rows = buildOperationRows(
      targets,
      new Map(),
      new Map(),
    );
    expect(rows[0].selectable).toBe(false);
    expect(rows[0].notSelectableReason).toBe("unsupported_engine");
  });
});

// ---------------------------------------------------------------------------
// groupOperationRows
// ---------------------------------------------------------------------------

describe("groupOperationRows", () => {
  const rows: CredentialOperationRow[] = [
    { resourceId: 1, environment: "Production", clusterName: "Cluster A", runtimeStatus: "secret_resolved" } as CredentialOperationRow,
    { resourceId: 2, environment: "Production", clusterName: "Cluster B", runtimeStatus: "missing_metadata" } as CredentialOperationRow,
    { resourceId: 3, environment: "Staging", clusterName: "Cluster A", runtimeStatus: "secret_missing" } as CredentialOperationRow,
  ];

  it("returns a single group for flat mode", () => {
    const groups = groupOperationRows(rows, "flat");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("all");
    expect(groups[0].rows).toHaveLength(3);
  });

  it("groups by environment", () => {
    const groups = groupOperationRows(rows, "environment");
    expect(groups).toHaveLength(2);
    const prodGroup = groups.find((g) => g.key === "Production");
    const stagingGroup = groups.find((g) => g.key === "Staging");
    expect(prodGroup?.rows).toHaveLength(2);
    expect(stagingGroup?.rows).toHaveLength(1);
  });

  it("groups by cluster", () => {
    const groups = groupOperationRows(rows, "cluster");
    expect(groups).toHaveLength(2);
    const clusterA = groups.find((g) => g.key === "Cluster A");
    const clusterB = groups.find((g) => g.key === "Cluster B");
    expect(clusterA?.rows).toHaveLength(2);
    expect(clusterB?.rows).toHaveLength(1);
  });

  it("groups are sorted alphabetically", () => {
    const groups = groupOperationRows(rows, "environment");
    expect(groups[0].key).toBe("Production");
    expect(groups[1].key).toBe("Staging");
  });
});

// ---------------------------------------------------------------------------
// filterCredentialRows
// ---------------------------------------------------------------------------

describe("filterCredentialRows", () => {
  const rows: CredentialOperationRow[] = [
    {
      resourceId: 1,
      displayName: "Order MySQL",
      resourceName: "order-mysql",
      engine: "mysql",
      environment: "Production",
      clusterName: "Cluster A",
      host: "order-db.internal",
      port: 3306,
      runtimeStatus: "secret_resolved",
      credential: { configured: true } as QueryCredentialStatusResponse,
      selectable: true,
    } as CredentialOperationRow,
    {
      resourceId: 2,
      displayName: "Payment MySQL",
      resourceName: "payment-mysql",
      engine: "mysql",
      environment: "Staging",
      clusterName: "Cluster B",
      host: "payment-db.internal",
      port: 3306,
      runtimeStatus: "missing_metadata",
      credential: { configured: false } as QueryCredentialStatusResponse,
      selectable: true,
    } as CredentialOperationRow,
  ];

  const emptyFilters: CredentialFilterState = {
    search: "",
    environment: "",
    cluster: "",
    engine: "",
    runtimeStatus: "",
    configuredState: "all",
    readinessFilter: "all",
  };

  it("returns all rows with empty filters", () => {
    expect(filterCredentialRows(rows, emptyFilters)).toHaveLength(2);
  });

  it("filters by search term", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      search: "order",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(1);
  });

  it("filters by environment", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      environment: "Production",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(1);
  });

  it("filters by cluster", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      cluster: "Cluster B",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(2);
  });

  it("filters by engine", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      engine: "mysql",
    });
    expect(filtered).toHaveLength(2);
  });

  it("filters by runtime status", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      runtimeStatus: "secret_resolved",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(1);
  });

  it("filters by configured state", () => {
    const configured = filterCredentialRows(rows, {
      ...emptyFilters,
      configuredState: "configured",
    });
    expect(configured).toHaveLength(1);
    expect(configured[0].resourceId).toBe(1);

    const unconfigured = filterCredentialRows(rows, {
      ...emptyFilters,
      configuredState: "unconfigured",
    });
    expect(unconfigured).toHaveLength(1);
    expect(unconfigured[0].resourceId).toBe(2);
  });

  it("filters by readiness (ready)", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      readinessFilter: "ready",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(1);
  });

  it("filters by readiness (not_ready)", () => {
    const filtered = filterCredentialRows(rows, {
      ...emptyFilters,
      readinessFilter: "not_ready",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resourceId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// collect helpers
// ---------------------------------------------------------------------------

describe("collect helpers", () => {
  const rows: CredentialOperationRow[] = [
    { environment: "Production", clusterName: "A", engine: "mysql", runtimeStatus: "secret_resolved" } as CredentialOperationRow,
    { environment: "Staging", clusterName: "B", engine: "mysql", runtimeStatus: "missing_metadata" } as CredentialOperationRow,
    { environment: "Production", clusterName: "A", engine: "clickhouse", runtimeStatus: "unsupported_target" } as CredentialOperationRow,
  ];

  it("collectEnvironments returns sorted unique values", () => {
    expect(collectEnvironments(rows)).toEqual(["Production", "Staging"]);
  });

  it("collectClusters returns sorted unique values", () => {
    expect(collectClusters(rows)).toEqual(["A", "B"]);
  });

  it("collectEngines returns sorted unique values", () => {
    expect(collectEngines(rows)).toEqual(["clickhouse", "mysql"]);
  });

  it("collectRuntimeStatuses returns sorted unique values", () => {
    expect(collectRuntimeStatuses(rows)).toEqual([
      "missing_metadata",
      "secret_resolved",
      "unsupported_target",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildCredentialPutBody (whitelist enforcement)
// ---------------------------------------------------------------------------

describe("buildCredentialPutBody", () => {
  it("includes only the four allowed fields", () => {
    const body = buildCredentialPutBody({
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });

    expect(Object.keys(body).sort()).toEqual([
      "credentialRef",
      "enabled",
      "environmentPolicy",
    ]);
    expect(body.credentialRef).toBe("ORDER_MYSQL_RO");
    expect(body.enabled).toBe(true);
    expect(body.environmentPolicy).toBe("non_prod_only");
  });

  it("includes confirmAllEnvironments when provided", () => {
    const body = buildCredentialPutBody({
      credentialRef: "ORDER_MYSQL_RO",
      enabled: true,
      environmentPolicy: "all_environments",
      confirmAllEnvironments: true,
    });

    expect(Object.keys(body).sort()).toEqual([
      "confirmAllEnvironments",
      "credentialRef",
      "enabled",
      "environmentPolicy",
    ]);
    expect(body.confirmAllEnvironments).toBe(true);
  });

  it("omits confirmAllEnvironments when not provided", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: false,
      environmentPolicy: "non_prod_only",
    });

    expect(body).not.toHaveProperty("confirmAllEnvironments");
  });

  it("never contains actorUserId", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("actorUserId");
  });

  it("never contains dsn", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("dsn");
  });

  it("never contains password", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("password");
  });

  it("never contains host", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("host");
  });

  it("never contains port", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("port");
  });

  it("never contains engine", () => {
    const body = buildCredentialPutBody({
      credentialRef: "TEST",
      enabled: true,
      environmentPolicy: "non_prod_only",
    });
    expect(body).not.toHaveProperty("engine");
  });
});
