import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import * as relationService from "@/services/resources";
import * as settingsService from "@/services/settings";
import messages from "@/messages/en.json";
import type { ResourceRelationViewModel } from "@/types/view-models";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/services/resources", () => ({
  createResourceRelation: vi.fn(),
  deleteResourceRelation: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listRelationTypes: vi.fn(),
}));

const mockedCreateRelation = vi.mocked(relationService.createResourceRelation);
const mockedDeleteRelation = vi.mocked(relationService.deleteResourceRelation);
const mockedListRelationTypes = vi.mocked(settingsService.listRelationTypes);

vi.mock("@/components/blocks/resource-search-combobox", () => ({
  ResourceSearchCombobox: ({
    onSelect,
    excludeIds,
  }: {
    onSelect: (resource: {
      id: number;
      displayName: string;
      resourceType: string;
    }) => void;
    excludeIds?: number[];
  }) => (
    <button
      type="button"
      data-testid="resource-search-combobox"
      data-exclude-ids={excludeIds?.join(",") ?? ""}
      onClick={() =>
        onSelect({
          id: 9,
          displayName: "orders-replica",
          resourceType: "database_instance",
        })
      }
    >
      pick resource
    </button>
  ),
}));

const relations: ResourceRelationViewModel[] = [
  {
    id: 1,
    fromResourceId: 1,
    toResourceId: 2,
    relationType: "member_of",
    createdAt: "2026-04-11T13:00:00Z",
    relatedResourceId: 2,
    relatedResourceName: "orders-cluster",
    direction: "outgoing",
    relatedResource: {
      id: 2,
      displayName: "orders-cluster",
      resourceType: "database_cluster",
      healthStatus: "healthy",
    },
  },
];

describe("ResourceRelationPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refresh.mockClear();

    mockedListRelationTypes.mockResolvedValue([
      { key: "member_of", label: "Member of", description: "" },
      { key: "depends_on", label: "Depends on", description: "" },
    ]);
  });

  it("renders relations with linked name, type, and resource type badge", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relations} />
      </NextIntlClientProvider>,
    );

    // Name is rendered as a link to the resource detail page
    const link = screen.getByRole("link", { name: "orders-cluster" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/resources/2");

    // Relation type and direction are still shown
    expect(screen.getByText(/Member Of/)).toBeInTheDocument();
    expect(screen.getByText(/outgoing/)).toBeInTheDocument();

    // Resource type badge is shown
    expect(screen.getByText("Database Cluster")).toBeInTheDocument();
  });

  it("shows empty state when no relations and no resourceId", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("No linked resources")).toBeInTheDocument();
    expect(screen.queryByText("Add relation")).not.toBeInTheDocument();
  });

  it("shows add-relation button when resourceId is provided", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Add relation")).toBeInTheDocument();
  });

  it("toggles add-relation form on button click", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    // Click to open add form
    await user.click(screen.getByText("Add relation"));

    await waitFor(() => {
      expect(screen.getByText("Target resource")).toBeInTheDocument();
      expect(screen.getByText("Relation type")).toBeInTheDocument();
    });

    expect(screen.getByTestId("resource-search-combobox")).toHaveAttribute(
      "data-exclude-ids",
      "1",
    );

    // Button text changes to Cancel
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("creates a relation with numeric source and target ids", async () => {
    const user = userEvent.setup();
    mockedCreateRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByTestId("resource-search-combobox"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Member of"));
    await user.click(screen.getByRole("button", { name: "Add relation" }));

    await waitFor(() => {
      expect(mockedCreateRelation).toHaveBeenCalledWith(1, {
        toResourceId: 9,
        relationType: "member_of",
      });
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("deletes a relation when the remove button is clicked", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    const removeButton = screen.getByRole("button", {
      name: /Remove this relation/i,
    });
    await user.click(removeButton);

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenCalledWith(1);
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows no error when delete succeeds (204)", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenCalledWith(1);
    });

    expect(refresh).toHaveBeenCalledOnce();

    // No error message should appear
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows not-found error when delete fails with 404", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockRejectedValue(
      new Error("Request failed: 404"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText("The target resource was not found."),
      ).toBeInTheDocument();
    });
  });

  it("shows backend error and preserves relation when delete fails with 500", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockRejectedValue(
      new Error("Request failed: 500"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText("The backend service is not available. Please try again later."),
      ).toBeInTheDocument();
    });

    // Relation should still be visible in the list
    expect(screen.getByText("orders-cluster")).toBeInTheDocument();
  });
});
