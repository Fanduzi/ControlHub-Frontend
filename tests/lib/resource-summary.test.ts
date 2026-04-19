import { describe, expect, it } from "vitest";

import {
  buildLocalizedFallbackSummary,
  localizeResourceType,
} from "@/lib/resource-summary";

/**
 * Mock translator simulating next-intl with zh-CN labels.
 * Supports `t(key)` and `t.has(key)`.
 */
function createMockTranslator(labels: Record<string, string>) {
  const t = (key: string) => labels[key] ?? key;
  t.has = (key: string) => key in labels;
  return t;
}

const zhLabels: Record<string, string> = {
  "topology.types.database_cluster": "数据库集群",
  "topology.types.database_instance": "数据库实例",
  "topology.types.service": "服务",
  "topology.types.host": "主机",
  "statusValues.running": "运行中",
  "statusValues.degraded": "降级",
  "statusValues.healthy": "健康",
  "statusValues.warning": "告警",
  "statusValues.critical": "严重",
  "statusValues.unknown": "未知",
  "statusValues.stopped": "已停止",
};

const zhT = createMockTranslator(zhLabels);

describe("buildLocalizedFallbackSummary", () => {
  it("produces Chinese fallback for database_cluster + mysql + running", () => {
    const result = buildLocalizedFallbackSummary(
      {
        resourceType: "database_cluster",
        resourceSubtype: "mysql",
        lifecycleStatus: "running",
      },
      zhT,
    );

    expect(result).toContain("数据库集群");
    expect(result).toContain("运行中");
    expect(result).toContain("mysql");
    expect(result).not.toContain("Database Cluster");
    expect(result).not.toContain("Running");
    expect(result).not.toContain("Mysql");
  });

  it("produces Chinese fallback for database_cluster + mysql + degraded", () => {
    const result = buildLocalizedFallbackSummary(
      {
        resourceType: "database_cluster",
        resourceSubtype: "mysql",
        lifecycleStatus: "degraded",
      },
      zhT,
    );

    expect(result).toContain("数据库集群");
    expect(result).toContain("降级");
    expect(result).not.toContain("Degraded");
    expect(result).not.toContain("Database Cluster");
  });

  it("handles missing type label gracefully by using raw value", () => {
    const result = buildLocalizedFallbackSummary(
      {
        resourceType: "unknown_type",
        resourceSubtype: "mysql",
        lifecycleStatus: "running",
      },
      zhT,
    );

    expect(result).toContain("unknown_type");
    expect(result).toContain("运行中");
    expect(result).not.toContain("Running");
  });

  it("handles missing status label gracefully by using raw value", () => {
    const result = buildLocalizedFallbackSummary(
      {
        resourceType: "database_cluster",
        lifecycleStatus: "unknown_status",
      },
      zhT,
    );

    expect(result).toContain("数据库集群");
    expect(result).toContain("unknown_status");
  });

  it("joins parts with middle dot separator", () => {
    const result = buildLocalizedFallbackSummary(
      {
        resourceType: "database_instance",
        resourceSubtype: "clickhouse",
        lifecycleStatus: "stopped",
      },
      zhT,
    );

    expect(result).toBe("数据库实例 · clickhouse · 已停止");
  });

  it("returns empty string when no fields are present", () => {
    const result = buildLocalizedFallbackSummary({}, zhT);
    expect(result).toBe("");
  });
});

describe("localizeResourceType", () => {
  it("returns Chinese label for known type", () => {
    expect(localizeResourceType("database_cluster", zhT)).toBe("数据库集群");
    expect(localizeResourceType("database_instance", zhT)).toBe("数据库实例");
    expect(localizeResourceType("service", zhT)).toBe("服务");
  });

  it("returns raw value for unknown type", () => {
    expect(localizeResourceType("unknown_type", zhT)).toBe("unknown_type");
  });
});
