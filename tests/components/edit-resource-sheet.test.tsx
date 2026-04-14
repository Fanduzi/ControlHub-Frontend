import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditResourceSheet } from "@/components/resources/edit-resource-sheet";
import * as resourceService from "@/services/resources";
import * as settingsService from "@/services/settings";
import messages from "@/messages/en.json";
import type { ResourceDetailViewModel } from "@/types/view-models";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/services/resources", () => ({
  updateResource: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: vi.fn(),
  listOwners: vi.fn(),
  listLifecycleStatuses: vi.fn(),
  listHealthStatuses: vi.fn(),
}));

const mockedUpdateResource = vi.mocked(resourceService.updateResource);
const mockedListEnvironments = vi.mocked(settingsService.listEnvironments);
const mockedListOwners = vi.mocked(settingsService.listOwners);
const mockedListLifecycleStatuses = vi.mocked(
  settingsService.listLifecycleStatuses,
);
const mockedListHealthStatuses = vi.mocked(settingsService.listHealthStatuses);

const resource: ResourceDetailViewModel = {
  id: "res-1",
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: "env-prod",
  environmentName: "Production",
  ownerId: "owner-dba",
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: { team: "order" },
  summary: "Primary transactional database.",
  profile: {},
  relations: [],
  auditEvents: [],
};

describe("EditResourceSheet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refresh.mockClear();

    mockedListEnvironments.mockResolvedValue([
      { id: "env-prod", name: "Production", slug: "production", description: "", createdAt: "" },
    ]);
    mockedListOwners.mockResolvedValue([
      { id: "owner-dba", name: "DBA Team", email: "dba@example.com", createdAt: "" },
    ]);
    mockedListLifecycleStatuses.mockResolvedValue([
      { key: "running", label: "Running", description: "" },
    ]);
    mockedListHealthStatuses.mockResolvedValue([
      { key: "healthy", label: "Healthy", description: "" },
    ]);
  });

  it("renders immutable field hints for name and resourceType", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Name input is disabled
    const nameInput = screen.getByDisplayValue("orders-db-primary");
    expect(nameInput).toBeDisabled();

    // Resource type input is disabled
    const typeInput = screen.getByDisplayValue("database_instance");
    expect(typeInput).toBeDisabled();

    // Two immutable hints (one per disabled field)
    const hints = screen.getAllByText(
      "This field cannot be changed after creation.",
    );
    expect(hints).toHaveLength(2);
  });

  it("pre-fills mutable text fields from the resource", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Orders DB Primary")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("aws:rds:orders-primary"),
    ).toBeInTheDocument();
    // Labels textarea should contain the JSON stringified labels
    const labelsTextarea = screen.getByPlaceholderText('{"team": "order"}');
    expect(labelsTextarea).toHaveValue(
      JSON.stringify({ team: "order" }, null, 2),
    );
  });

  it("submits updated display name via updateResource and refreshes", async () => {
    const user = userEvent.setup();
    mockedUpdateResource.mockResolvedValue({} as never);
    const onOpenChange = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={onOpenChange}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Change the display name
    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Updated DB Name");

    // Submit
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockedUpdateResource).toHaveBeenCalledWith(
        "res-1",
        expect.objectContaining({ displayName: "Updated DB Name" }),
      );
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows backend error when update fails with 401", async () => {
    const user = userEvent.setup();
    mockedUpdateResource.mockRejectedValue(
      new Error("Request failed: 401"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Your session has expired. Please sign in again.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows validation error when labels JSON is malformed", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    const labelsTextarea = screen.getByPlaceholderText('{"team": "order"}');
    await user.clear(labelsTextarea);
    await user.type(labelsTextarea, "not-valid-json{{}");

    await user.click(screen.getByRole("button", { name: /Save/i }));

    expect(
      screen.getByText("Validation failed. Please check the form fields."),
    ).toBeInTheDocument();
    expect(mockedUpdateResource).not.toHaveBeenCalled();
  });

  it("never sends id, name, resourceType, or createdAt in the PATCH payload", async () => {
    const user = userEvent.setup();
    mockedUpdateResource.mockResolvedValue({} as never);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockedUpdateResource).toHaveBeenCalledOnce();
    });

    const [resourceId, payload] = mockedUpdateResource.mock.calls[0];
    expect(resourceId).toBe("res-1");

    // Immutable fields must never appear in PATCH payload
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("resourceType");
    expect(payload).not.toHaveProperty("createdAt");
  });
});
