import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { QueryWorkbench } from "@/components/query/query-workbench";
import { EMPTY_FILTERS } from "@/lib/query-target-display";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

function buildTargets(): QueryTarget[] {
  return [
    buildQueryTarget({
      resourceId: 22,
      displayName: "Analytics ClickHouse Node 01",
      resourceName: "analytics-ch-node-01",
      connectionContext: {
        environment: "Production",
        owner: "DBA Team",
        engine: "clickhouse",
        host: "prod-ch-host-01.internal",
        port: 8123,
        clusterName: "Analytics ClickHouse Cluster",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      schemaPreview: [],
    }),
    buildQueryTarget({
      resourceId: 23,
      displayName: "Payment Redis Cache",
      resourceName: "payment-redis",
      connectionContext: {
        environment: "Production",
        owner: "Payments",
        engine: "redis",
        host: "redis-payment.internal",
        port: 6379,
        clusterName: "Payment Redis Cache",
      },
      capability: {
        queryKind: "redis",
        editorMode: "redis",
        languageLabel: "Redis command",
      },
      schemaPreview: [],
    }),
  ];
}

function renderWorkbench(
  targets: QueryTarget[] = buildTargets(),
  messages: Record<string, unknown> = enMessages,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryWorkbench targets={targets} initialFilters={EMPTY_FILTERS} />
    </NextIntlClientProvider>,
  );
}

describe("QueryWorkbench", () => {
  it("renders the safety banner stating execution is not enabled", () => {
    renderWorkbench();

    expect(
      screen.getByText("Query execution is not enabled"),
    ).toBeInTheDocument();
  });

  it("renders the active target's facts in the switcher context and governance panel", () => {
    renderWorkbench();

    // The active target's host surfaces in both the switcher context card and
    // the governance "Target facts" list.
    expect(
      screen.getAllByText("prod-ch-host-01.internal:8123").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Execution disabled")).toBeInTheDocument();
  });

  it("renders every execution action locked (disabled) with no enabled Run/Execute button", () => {
    renderWorkbench();

    const runButton = screen.getByRole("button", { name: "Run locked" });
    const explainButton = screen.getByRole("button", { name: "Explain locked" });
    const saveSheetButton = screen.getByRole("button", { name: "Save sheet" });
    const exportButton = screen.getByRole("button", { name: "Export unavailable" });

    expect(runButton).toBeDisabled();
    expect(explainButton).toBeDisabled();
    expect(saveSheetButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // No enabled Run or Execute action may be present anywhere.
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
    const enabledExecutionButtons = screen
      .getAllByRole("button")
      .filter(
        (button) =>
          !button.hasAttribute("disabled") &&
          /^(run|execute)$/i.test(button.textContent ?? ""),
      );
    expect(enabledExecutionButtons).toHaveLength(0);
  });

  it("renders an honest locked schema placeholder for a SQL target without schema metadata", () => {
    renderWorkbench();

    expect(
      screen.getByText(
        /Database \/ schema \/ table \/ column placeholders appear once schema metadata/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Schema is locked/)).toBeInTheDocument();
  });

  it("renders the locked result area with a not-executed state", () => {
    renderWorkbench();

    expect(screen.getByText("Result grid")).toBeInTheDocument();
    expect(screen.getByText("0 rows · not executed")).toBeInTheDocument();
    expect(screen.getByText("Result area is locked")).toBeInTheDocument();
  });

  it("renders query history and access grant placeholders when those tabs are opened", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: "Query history" }));
    expect(
      screen.getByText(/Query history is unavailable/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Access grants" }));
    expect(screen.getByText(/Access grants are unavailable/)).toBeInTheDocument();
  });

  it("narrows the target list with search and reflects the new active target in governance", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(
      screen.getByRole("searchbox", { name: "Search target, engine, or host" }),
      "redis",
    );

    // Only the redis target survives; it becomes the active target.
    expect(
      screen.getAllByText("redis-payment.internal:6379").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1 targets")).toBeInTheDocument();
    expect(
      screen.queryByText("prod-ch-host-01.internal:8123"),
    ).not.toBeInTheDocument();
  });

  it("renders localized copy under the zh-CN locale", () => {
    renderWorkbench(buildTargets(), zhMessages);

    expect(screen.getByText("查询执行尚未启用")).toBeInTheDocument();
  });
});
