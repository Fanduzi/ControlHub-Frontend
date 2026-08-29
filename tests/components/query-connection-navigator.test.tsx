import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueryConnectionNavigator } from "@/components/query/query-connection-navigator";
import { EMPTY_FILTERS, type WorkbenchFilters } from "@/lib/query-target-display";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";

function buildTwoTargets(): QueryTarget[] {
  return [
    buildQueryTarget({
      resourceId: 10,
      displayName: "Analytics ClickHouse Node",
      resourceName: "analytics-ch-node",
      connectionContext: {
        environment: "Production",
        engine: "clickhouse",
        host: "prod-ch.internal",
        port: 8123,
        clusterName: "Analytics ClickHouse Cluster",
        owner: "DBA",
      },
      readiness: "ready",
    }),
    buildQueryTarget({
      resourceId: 20,
      displayName: "Development MySQL",
      resourceName: "dev-mysql",
      connectionContext: {
        environment: "Development",
        engine: "mysql",
        host: "dev-mysql.internal",
        port: 3306,
        clusterName: "Dev MySQL Cluster",
        owner: "Platform",
      },
      readiness: "credential_required",
    }),
  ];
}

function renderNavigator(
  props: Partial<{
    targets: QueryTarget[];
    activeTargetId: number | null;
    filters: WorkbenchFilters;
    engines: string[];
    pageInfo?: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    onSelect: (resourceId: number) => void;
    onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
    onLoadMore: () => void;
  }> = {},
) {
  return render(renderNavigatorElement(props));
}

function renderNavigatorElement(
  props: Partial<{
    targets: QueryTarget[];
    activeTargetId: number | null;
    filters: WorkbenchFilters;
    engines: string[];
    pageInfo: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    onSelect: (resourceId: number) => void;
    onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
    onLoadMore: () => void;
  }> = {},
  messages: Record<string, unknown> = enMessages,
  locale = "en",
) {
  const targets = props.targets ?? buildTwoTargets();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryConnectionNavigator
        targets={targets}
        activeTargetId={props.activeTargetId ?? targets[0]!.resourceId}
        filters={props.filters ?? EMPTY_FILTERS}
        engines={props.engines ?? ["clickhouse", "mysql"]}
        pageInfo={props.pageInfo ?? {
          page: 1,
          pageSize: 50,
          totalItems: targets.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }}
        onSelect={props.onSelect ?? vi.fn()}
        onFilterChange={props.onFilterChange ?? vi.fn()}
        onLoadMore={props.onLoadMore}
      />
    </NextIntlClientProvider>
  );
}

describe("QueryConnectionNavigator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups targets by environment and cluster", () => {
    renderNavigator();

    expect(screen.getByRole("heading", { name: "Development" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Analytics ClickHouse Cluster" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dev MySQL Cluster" }),
    ).toBeInTheDocument();
  });

  it("searches by host engine environment and readiness", () => {
    const targets = buildTwoTargets();
    const { rerender } = renderNavigator({ targets });

    rerender(renderNavigatorElement({ targets, filters: { ...EMPTY_FILTERS, q: "mysql" } }));
    expect(
      screen.getByRole("button", { name: "Development MySQL" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Analytics ClickHouse Node" }),
    ).not.toBeInTheDocument();

    rerender(renderNavigatorElement({ targets, filters: { ...EMPTY_FILTERS, q: "Production" } }));
    expect(
      screen.getByRole("button", { name: "Analytics ClickHouse Node" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Development MySQL" }),
    ).not.toBeInTheDocument();

    rerender(renderNavigatorElement({ targets, filters: { ...EMPTY_FILTERS, q: "ready" } }));
    expect(
      screen.getByRole("button", { name: "Analytics ClickHouse Node" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Development MySQL" }),
    ).not.toBeInTheDocument();
  });

  it("highlights the active target", () => {
    const targets = buildTwoTargets();
    renderNavigator({ targets, activeTargetId: targets[1]!.resourceId });

    const activeButton = screen.getByRole("button", { current: true });
    expect(activeButton).toHaveTextContent("Development MySQL");
  });

  it("does not duplicate the active connection summary inside the navigator", () => {
    const targets = buildTwoTargets();
    renderNavigator({
      targets,
      activeTargetId: targets[1]!.resourceId,
      filters: { ...EMPTY_FILTERS, engine: "clickhouse" },
    });

    expect(screen.queryByRole("region", { name: "Active connection" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Development MySQL" }),
    ).not.toBeInTheDocument();
  });

  it("selecting a target calls onSelect with resource id", async () => {
    const user = userEvent.setup();
    const targets = buildTwoTargets();
    const onSelect = vi.fn();

    renderNavigator({ targets, onSelect, activeTargetId: targets[0]!.resourceId });

    await user.click(screen.getByRole("button", { name: "Development MySQL" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(targets[1]!.resourceId);
  });

  /**
   * The count describes the currently displayed list rather than a stale
   * unfiltered server total.
   */
  it("renders a localized truthful target count and explicit load-more action", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderNavigator({
      targets: buildTwoTargets(),
      filters: { ...EMPTY_FILTERS, engine: "clickhouse" },
      onLoadMore,
      pageInfo: {
        page: 1,
        pageSize: 2,
        totalItems: 64,
        totalPages: 32,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });

    expect(
      screen.getByText("Showing 1 of 64 targets"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more targets" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("localizes the current target count in Chinese", () => {
    render(
      renderNavigatorElement(
        {
          filters: { ...EMPTY_FILTERS, engine: "clickhouse" },
          pageInfo: {
            page: 1,
            pageSize: 2,
            totalItems: 64,
            totalPages: 32,
            hasNextPage: true,
            hasPreviousPage: false,
          },
        },
        zhMessages,
        "zh-CN",
      ),
    );

    expect(screen.getByText("已加载 1 / 共 64 个目标")).toBeInTheDocument();
  });
});
