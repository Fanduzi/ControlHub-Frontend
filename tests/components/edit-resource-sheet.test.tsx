// input: Vitest, React Testing Library, localized messages, and mocked resource/settings services
// output: edit-save and typed-profile field assertions, including clear and removal behavior
// pos: component-level contract for resource edit behavior
// note: if this file changes, update this header and tests/components/README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditResourceSheet } from "@/components/resources/edit-resource-sheet";
import * as resourceService from "@/services/resources";
import { ApiError } from "@/services/api-client";
import * as settingsService from "@/services/settings";
import messages from "@/messages/en.json";
import type { ResourceDetailViewModel } from "@/types/view-models";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/services/resources", () => ({
  updateResource: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  getResourceProfileById: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: vi.fn(),
  listOwners: vi.fn(),
  listLifecycleStatuses: vi.fn(),
  listHealthStatuses: vi.fn(),
  listResourceSubtypes: vi.fn(),
}));

const mockedUpdateResource = vi.mocked(resourceService.updateResource);
const mockedUpdateProfile = vi.mocked(resourceService.updateProfile);
const mockedDeleteProfile = vi.mocked(resourceService.deleteProfile);
const mockedGetResourceProfileById = vi.mocked(
  resourceService.getResourceProfileById,
);
const mockedListEnvironments = vi.mocked(settingsService.listEnvironments);
const mockedListOwners = vi.mocked(settingsService.listOwners);
const mockedListLifecycleStatuses = vi.mocked(
  settingsService.listLifecycleStatuses,
);
const mockedListHealthStatuses = vi.mocked(settingsService.listHealthStatuses);
const mockedListResourceSubtypes = vi.mocked(
  settingsService.listResourceSubtypes,
);

const resource: ResourceDetailViewModel = {
  id: 1,
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: 1,
  environmentName: "Production",
  ownerId: 1,
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: { team: "order" },
  summary: "Primary transactional database.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  profile: {},
  relations: [],
  auditEvents: [],
};

const hostResource: ResourceDetailViewModel = {
  id: 2,
  resourceType: "host",
  resourceSubtype: "",
  name: "prod-host-01",
  displayName: "Production Host 01",
  environmentId: 1,
  environmentName: "Production",
  ownerId: 1,
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: {},
  summary: "Production host.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  profile: {},
  relations: [],
  auditEvents: [],
};

const domainNameResource: ResourceDetailViewModel = {
  ...hostResource,
  id: 3,
  resourceType: "domain_name",
  resourceSubtype: "dns",
  name: "orders-domain",
  displayName: "Orders Domain",
  summary: "Orders DNS name.",
};

const virtualIPResource: ResourceDetailViewModel = {
  ...hostResource,
  id: 4,
  resourceType: "virtual_ip",
  resourceSubtype: "floating",
  name: "orders-vip",
  displayName: "Orders VIP",
  summary: "Orders floating IP.",
};

describe("EditResourceSheet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refresh.mockClear();

    mockedListEnvironments.mockResolvedValue([
      { id: 1, name: "Production", slug: "production", description: "", createdAt: "" },
    ]);
    mockedListOwners.mockResolvedValue([
      { id: 1, name: "DBA Team", email: "dba@example.com", createdAt: "" },
    ]);
    mockedListLifecycleStatuses.mockResolvedValue([
      { key: "running", label: "Running", description: "" },
    ]);
    mockedListHealthStatuses.mockResolvedValue([
      { key: "healthy", label: "Healthy", description: "" },
    ]);
    mockedListResourceSubtypes.mockResolvedValue([
      { key: "mysql", label: "MySQL", description: "" },
      { key: "postgresql", label: "PostgreSQL", description: "" },
    ]);
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: 1,
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      profile: {
        engine: "mysql",
        version: "8.0",
        host: "db-host-01",
        port: 3306,
        role: "primary",
      },
    });
    mockedUpdateResource.mockResolvedValue({} as never);
    mockedUpdateProfile.mockResolvedValue(undefined);
    mockedDeleteProfile.mockResolvedValue(undefined);
  });

  it("loads profile data on open and pre-fills profile fields", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Wait for profile to be fetched
    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalledWith(1);
    });

    // Profile fields should be pre-filled with the profile data values
    // "mysql" appears in both the subtype hidden input and the profile engine input
    await waitFor(() => {
      const mysqlInputs = screen.getAllByDisplayValue("mysql");
      expect(mysqlInputs.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByDisplayValue("8.0")).toBeInTheDocument();
      expect(screen.getByDisplayValue("db-host-01")).toBeInTheDocument();
      expect(screen.getByDisplayValue("3306")).toBeInTheDocument();
    });
  });

  it("name field is editable (not disabled)", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Name input should be present with its value and NOT disabled
    const nameInput = await screen.findByDisplayValue("orders-db-primary");
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).not.toBeDisabled();

    // Should show the editable hint text
    expect(
      screen.getByText(
        "Identifier used for system references. Changing it may affect integrations.",
      ),
    ).toBeInTheDocument();
  });

  it("resourceType field is displayed as disabled", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Resource type should show as a disabled input
    const typeInput = await screen.findByDisplayValue("Database Instance");
    expect(typeInput).toBeInTheDocument();
    expect(typeInput).toBeDisabled();

    // Immutable hint
    expect(
      screen.getByText("This field cannot be changed after creation."),
    ).toBeInTheDocument();
  });

  it("pre-fills base form fields from the resource", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalled();
    });

    // Display name should be pre-filled
    expect(screen.getByDisplayValue("Orders DB Primary")).toBeInTheDocument();
    // External ID should be pre-filled
    expect(
      screen.getByDisplayValue("aws:rds:orders-primary"),
    ).toBeInTheDocument();
    // Labels should be pre-filled
    expect(screen.getByDisplayValue("team")).toBeInTheDocument();
    expect(screen.getByDisplayValue("order")).toBeInTheDocument();
  });

  it("save calls both PATCH endpoints when base and profile fields change", async () => {
    const user = userEvent.setup();
    mockedUpdateResource.mockResolvedValue({} as never);
    mockedUpdateProfile.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    // Wait for data to load
    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalledWith(1);
    });

    // Change display name (base field)
    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Updated DB Name");

    // Change a profile field (e.g., version)
    const versionInput = screen.getByDisplayValue("8.0");
    await user.clear(versionInput);
    await user.type(versionInput, "8.4");

    // Submit
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      // Both PATCH calls should have been made
      expect(mockedUpdateResource).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ displayName: "Updated DB Name" }),
      );
      expect(mockedUpdateProfile).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ version: "8.4" }),
      );
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("save only calls resource PATCH when only base fields changed", async () => {
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

    // Wait for data to load
    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalled();
    });

    // Change only the display name (base field)
    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Updated DB Name");

    // Submit
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockedUpdateResource).toHaveBeenCalledOnce();
    });

    // Should NOT call updateProfile since no profile fields changed
    expect(mockedUpdateProfile).not.toHaveBeenCalled();

    // Verify the resource PATCH payload
    const [resourceId, payload] = mockedUpdateResource.mock.calls[0];
    expect(resourceId).toBe(1);
    expect(payload).toEqual(
      expect.objectContaining({ displayName: "Updated DB Name" }),
    );

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("sends an empty profile value so the backend clears that field", async () => {
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

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalledWith(1);
    });

    await user.clear(screen.getByDisplayValue("8.0"));
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith(1, { version: "" });
    });
  });

  it("clears the typed profile only after confirmation", async () => {
    const user = userEvent.setup();
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

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalledWith(1);
    });

    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Unsaved name");

    await user.click(
      screen.getByRole("button", { name: /Clear typed profile/i }),
    );
    expect(mockedDeleteProfile).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "This removes all type-specific operational fields from this resource and discards your unsaved edits. The resource itself will not be deleted.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Clear profile/i }));

    await waitFor(() => {
      expect(mockedDeleteProfile).toHaveBeenCalledWith(1);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not submit an empty numeric profile value", async () => {
    const user = userEvent.setup();
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

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalledWith(1);
    });

    await user.clear(screen.getByDisplayValue("3306"));
    await user.click(screen.getByRole("button", { name: /Save/i }));

    expect(mockedUpdateProfile).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Use Clear typed profile to remove numeric profile fields.",
      ),
    ).toBeInTheDocument();
  });

  it("never sends id, resourceType, or createdAt in the PATCH payload", async () => {
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

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalled();
    });

    // Change display name to trigger submission
    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "New Name");

    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockedUpdateResource).toHaveBeenCalledOnce();
    });

    const [, payload] = mockedUpdateResource.mock.calls[0];

    // Immutable fields must never appear in PATCH payload
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("resourceType");
    expect(payload).not.toHaveProperty("createdAt");
  });

  it("shows profile section with no-profile-fields message for types without profile schema", async () => {
    mockedGetResourceProfileById.mockResolvedValue(null);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={hostResource}
        />
      </NextIntlClientProvider>,
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(mockedListResourceSubtypes).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("Runtime Profile")).toBeInTheDocument();
    });
  });

  it("shows FQDN profile field for Domain Name and no resolution target", async () => {
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: domainNameResource.id,
      resourceType: "domain_name",
      resourceSubtype: "dns",
      profile: { fqdn: "orders.example.com" },
    });
    mockedListResourceSubtypes.mockResolvedValue([
      { key: "dns", label: "DNS", description: "" },
    ]);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={domainNameResource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/FQDN \*/)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("orders.example.com")).toBeInTheDocument();
    expect(
      screen.queryByText("This resource type has no profile fields."),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/resolution/i)).not.toBeInTheDocument();
  });

  it("shows IP Address profile field for Virtual IP", async () => {
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: virtualIPResource.id,
      resourceType: "virtual_ip",
      resourceSubtype: "floating",
      profile: { ipAddress: "10.0.0.10" },
    });
    mockedListResourceSubtypes.mockResolvedValue([
      { key: "floating", label: "Floating", description: "" },
    ]);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditResourceSheet
          open
          onOpenChange={() => undefined}
          resource={virtualIPResource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/IP Address \*/)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("10.0.0.10")).toBeInTheDocument();
  });

  it("shows backend error when update fails with 401", async () => {
    const user = userEvent.setup();
    mockedUpdateResource.mockRejectedValue(
      new ApiError(401, "Request failed: 401"),
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

    await waitFor(() => {
      expect(mockedGetResourceProfileById).toHaveBeenCalled();
    });

    // Change a base field to enable submission
    const displayNameInput = screen.getByDisplayValue("Orders DB Primary");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Changed Name");

    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Your session has expired. Please sign in again.",
        ),
      ).toBeInTheDocument();
    });
  });
});
