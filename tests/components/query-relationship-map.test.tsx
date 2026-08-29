import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/query-schema", () => ({
  getRelationshipMap: vi.fn(),
}));

import { QueryRelationshipMap } from "@/components/query/query-relationship-map";
import { getRelationshipMap } from "@/services/query-schema";
import type { RelationshipMapResponse } from "@/types/query-schema";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockGetRelationshipMap = vi.mocked(getRelationshipMap);

function buildResponse(overrides: Partial<RelationshipMapResponse> = {}): RelationshipMapResponse {
  return {
    targetResourceId: 1,
    root: { id: "r1", database: "test_db", name: "users", kind: "table", role: "root" },
    nodes: [
      { id: "n1", database: "test_db", name: "orders", kind: "table", role: "related" },
    ],
    edges: [
      {
        id: "e1",
        direction: "outbound",
        sourceId: "r1",
        targetId: "n1",
        columns: ["id"],
        referencedColumns: ["user_id"],
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    ],
    truncated: false,
    ...overrides,
  };
}

function renderComponent(
  props: Partial<Parameters<typeof QueryRelationshipMap>[0]> = {},
  locale = "en",
) {
  const onBack = vi.fn();
  const messages = locale === "zh-CN" ? zhMessages : enMessages;
  const result = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryRelationshipMap
        targetId={1}
        database="test_db"
        name="users"
        onBack={onBack}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onBack, ...result };
}

describe("QueryRelationshipMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues one /relationship-map request on mount", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());

    renderComponent();

    await waitFor(() => {
      expect(mockGetRelationshipMap).toHaveBeenCalledTimes(1);
    });
    expect(mockGetRelationshipMap).toHaveBeenCalledWith(1, {
      database: "test_db",
      name: "users",
      signal: expect.any(AbortSignal),
    });
  });

  it("shows loading state while fetch is pending", () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    mockGetRelationshipMap.mockReturnValue(fetchPromise as ReturnType<typeof getRelationshipMap>);

    renderComponent();

    expect(screen.getByText("Loading…")).toBeVisible();

    resolveFetch(buildResponse());
  });

  it("renders root node name and edges on success", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());

    renderComponent();

    expect(await screen.findByText("test_db.users")).toBeVisible();
    expect(screen.getByText("test_db.orders")).toBeVisible();
    const outboundMatches = screen.getAllByText("Outbound");
    expect(outboundMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty message when no edges exist", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(
      buildResponse({ nodes: [], edges: [] }),
    );

    renderComponent();

    expect(await screen.findByText("No foreign key relationships found.")).toBeVisible();
  });

  it("shows error message and retry button on fetch failure", async () => {
    mockGetRelationshipMap.mockRejectedValueOnce(
      Object.assign(new Error("Server Error"), { status: 500 }),
    );

    renderComponent();

    expect(await screen.findByText("Failed to load relationships.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("retry button triggers a second request", async () => {
    mockGetRelationshipMap.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());

    renderComponent();
    const user = userEvent.setup();

    await screen.findByText("Table is no longer available.");

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetRelationshipMap).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("test_db.users")).toBeVisible();
  });

  it("uses refresh=true once for an explicit operator refresh", async () => {
    mockGetRelationshipMap.mockResolvedValue(buildResponse());
    const user = userEvent.setup();

    const { rerender } = renderComponent();
    await screen.findByText("test_db.users");
    await user.click(screen.getByRole("button", { name: "Refresh relationships" }));

    await waitFor(() => {
      expect(mockGetRelationshipMap).toHaveBeenCalledTimes(2);
    });
    expect(mockGetRelationshipMap).toHaveBeenLastCalledWith(1, {
      database: "test_db",
      name: "users",
      refresh: true,
      signal: expect.any(AbortSignal),
    });

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryRelationshipMap targetId={1} database="test_db" name="orders" onBack={vi.fn()} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => {
      expect(mockGetRelationshipMap).toHaveBeenCalledTimes(3);
    });
    expect(mockGetRelationshipMap).toHaveBeenLastCalledWith(1, {
      database: "test_db",
      name: "orders",
      signal: expect.any(AbortSignal),
    });
  });

  it("shows truncation notice when truncated=true", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse({ truncated: true }));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("relationship-truncated")).toBeVisible();
    });
    expect(screen.getByTestId("relationship-truncated")).toHaveTextContent(
      "Showing partial results. Some relationships were omitted due to size limits.",
    );
  });

  it("does not show truncation notice when truncated=false", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse({ truncated: false }));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("test_db.users")).toBeVisible();
    });
    expect(screen.queryByTestId("relationship-truncated")).not.toBeInTheDocument();
  });

  it("back button calls onBack prop", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());
    const { onBack } = renderComponent();
    const user = userEvent.setup();

    const backButton = await screen.findByRole("button", { name: /Back to details/ });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders EN labels correctly", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());

    renderComponent({}, "en");

    const outboundMatches = await screen.findAllByText("Outbound");
    expect(outboundMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders ZH labels correctly", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(buildResponse());

    renderComponent({}, "zh-CN");

    const outboundMatches = await screen.findAllByText("出站");
    expect(outboundMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders inbound edges with correct label", async () => {
    mockGetRelationshipMap.mockResolvedValueOnce(
      buildResponse({
        edges: [
          {
            id: "e1",
            direction: "inbound",
            sourceId: "n1",
            targetId: "r1",
            columns: ["user_id"],
            referencedColumns: ["id"],
            onUpdate: "NO ACTION",
            onDelete: "CASCADE",
          },
        ],
      }),
    );

    renderComponent();

    const inboundMatches = await screen.findAllByText("Inbound");
    expect(inboundMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 403 error with access denied message", async () => {
    mockGetRelationshipMap.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    renderComponent();

    expect(await screen.findByText("Target access is not allowed.")).toBeVisible();
  });

  it("shows 408 error with timeout message", async () => {
    mockGetRelationshipMap.mockRejectedValueOnce(
      Object.assign(new Error("Timeout"), { status: 408 }),
    );

    renderComponent();

    expect(await screen.findByText("Metadata request timed out.")).toBeVisible();
  });
});
