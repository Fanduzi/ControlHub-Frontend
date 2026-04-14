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

const mockedDeleteRelation = vi.mocked(relationService.deleteResourceRelation);
const mockedListRelationTypes = vi.mocked(settingsService.listRelationTypes);

const relations: ResourceRelationViewModel[] = [
  {
    id: "rel-1",
    fromResourceId: "res-1",
    toResourceId: "res-2",
    relationType: "member_of",
    createdAt: "2026-04-11T13:00:00Z",
    relatedResourceId: "res-2",
    relatedResourceName: "orders-cluster",
    direction: "outgoing",
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

  it("renders relations with name, type, and resource ID", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relations} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("orders-cluster")).toBeInTheDocument();
    expect(screen.getByText(/Member Of/)).toBeInTheDocument();
    expect(screen.getByText(/outgoing/)).toBeInTheDocument();
    expect(screen.getByText("res-2")).toBeInTheDocument();
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
        <ResourceRelationPanel relations={[]} resourceId="res-1" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Add relation")).toBeInTheDocument();
  });

  it("toggles add-relation form on button click", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId="res-1" />
      </NextIntlClientProvider>,
    );

    // Click to open add form
    await user.click(screen.getByText("Add relation"));

    await waitFor(() => {
      expect(screen.getByText("Target resource")).toBeInTheDocument();
      expect(screen.getByText("Relation type")).toBeInTheDocument();
    });

    // Button text changes to Cancel
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("deletes a relation when the remove button is clicked", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId="res-1"
        />
      </NextIntlClientProvider>,
    );

    const removeButton = screen.getByRole("button", {
      name: /Remove this relation/i,
    });
    await user.click(removeButton);

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenCalledWith("rel-1");
    });

    expect(refresh).toHaveBeenCalledOnce();
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
          resourceId="res-1"
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("The target resource was not found."),
      ).toBeInTheDocument();
    });
  });
});
