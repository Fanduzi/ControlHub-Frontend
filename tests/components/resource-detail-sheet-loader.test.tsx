// input: resource detail sheet loader, mocked view-model service, localized test data
// output: loader open behavior and same-id archive/restore refetch regression tests
// pos: component tests for client detail data refresh
// note: if this file changes, update header and tests/components/README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResourceDetailSheetLoader } from "@/components/resources/resource-detail-sheet-loader";
import { getResourceViewModel } from "@/lib/view-models";
import messages from "@/messages/en.json";

vi.mock("@/lib/view-models", () => ({
  getResourceViewModel: vi.fn(),
}));

const {
  archiveMock,
  getEffectiveValuesMock,
  refreshMock,
  unarchiveMock,
} = vi.hoisted(() => ({
  archiveMock: vi.fn(),
  getEffectiveValuesMock: vi.fn(),
  refreshMock: vi.fn(),
  unarchiveMock: vi.fn(),
}));

let isAdmin = true;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

vi.mock("@/services/resources", () => ({
  archiveResource: archiveMock,
  clearResourceOverride: vi.fn(),
  getEffectiveValues: getEffectiveValuesMock,
  setResourceOverride: vi.fn(),
  unarchiveResource: unarchiveMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

vi.mock("@/components/blocks/topology-panel", () => ({
  TopologyPanel: ({ resourceId }: { resourceId: number }) => (
    <div data-testid="topology-panel-mock">{resourceId}</div>
  ),
}));

vi.mock("@/components/resources/edit-resource-sheet", () => ({
  EditResourceSheet: () => null,
}));

vi.mock("@/components/blocks/resource-relation-panel", () => ({
  ResourceRelationPanel: ({ relations }: { relations: Array<{ id: number; relatedResourceName: string }> }) => (
    <div>
      {relations.map((r) => (
        <div key={r.id}>{r.relatedResourceName}</div>
      ))}
    </div>
      ),
}));

const mockedGetResourceViewModel = vi.mocked(getResourceViewModel);

const resource = {
  id: 101,
  resourceType: "database_instance" as const,
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: 1,
  environmentName: "Production",
  ownerId: 1,
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: {
    team: "order",
    role: "primary",
  },
  summary: "Primary transactional database handling checkout and order writes.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
};

const activeDetail = {
  ...resource,
  profile: {
    engine: "MySQL 8.0",
    endpoint: "orders-primary.internal:3306",
  },
  relations: [],
  auditEvents: [],
};

const archivedDetail = {
  ...activeDetail,
  archivedAt: "2026-04-11T14:00:00Z",
  archivedBy: 1,
  archiveReason: "Retired",
  isArchived: true,
};

const archivedResource = {
  ...resource,
  archivedAt: "2026-04-11T14:00:00Z",
  archivedBy: 1,
  archiveReason: "Retired",
  isArchived: true,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("ResourceDetailSheetLoader", () => {
  beforeEach(() => {
    isAdmin = true;
    vi.resetAllMocks();
    getEffectiveValuesMock.mockResolvedValue({ values: {} });
  });

  it("does not fetch detail data until the sheet opens", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open={false}
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    expect(mockedGetResourceViewModel).not.toHaveBeenCalled();
  });

  it("fetches the full detail model on open and renders backend profile data", async () => {
    mockedGetResourceViewModel.mockResolvedValue(activeDetail);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(mockedGetResourceViewModel).toHaveBeenCalledWith(resource.id);
    });
    expect(
      await screen.findByText("orders-primary.internal:3306"),
    ).toBeInTheDocument();
  });

  it("refetches same-id detail data after archive changes", async () => {
    const user = userEvent.setup();
    mockedGetResourceViewModel
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValueOnce(archivedDetail);
    archiveMock.mockResolvedValue(archivedDetail);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(2));
    expect(mockedGetResourceViewModel).toHaveBeenNthCalledWith(1, resource.id);
    expect(mockedGetResourceViewModel).toHaveBeenNthCalledWith(2, resource.id);
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("refetches same-id detail data after restore changes", async () => {
    const user = userEvent.setup();
    mockedGetResourceViewModel
      .mockResolvedValueOnce(archivedDetail)
      .mockResolvedValueOnce(activeDetail);
    unarchiveMock.mockResolvedValue(activeDetail);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open
          onOpenChange={() => undefined}
          resource={archivedResource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await user.click(screen.getAllByRole("button", { name: "Restore" }).pop()!);

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(2));
    expect(mockedGetResourceViewModel).toHaveBeenNthCalledWith(1, resource.id);
    expect(mockedGetResourceViewModel).toHaveBeenNthCalledWith(2, resource.id);
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("keeps refreshed archive data when the older same-id request resolves last", async () => {
    const user = userEvent.setup();
    const initialRequest = deferred<typeof activeDetail>();
    const refreshRequest = deferred<typeof archivedDetail>();
    mockedGetResourceViewModel
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise);
    archiveMock.mockResolvedValue(archivedDetail);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);
    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(2));

    refreshRequest.resolve(archivedDetail);
    await waitFor(() => expect(screen.getByText("Retired")).toBeInTheDocument());

    initialRequest.resolve(activeDetail);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("keeps refreshed active data when the older same-id request resolves last", async () => {
    const user = userEvent.setup();
    const initialRequest = deferred<typeof archivedDetail>();
    const refreshRequest = deferred<typeof activeDetail>();
    mockedGetResourceViewModel
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise);
    unarchiveMock.mockResolvedValue(activeDetail);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheetLoader
          open
          onOpenChange={() => undefined}
          resource={archivedResource}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await user.click(screen.getAllByRole("button", { name: "Restore" }).pop()!);
    await waitFor(() => expect(mockedGetResourceViewModel).toHaveBeenCalledTimes(2));

    refreshRequest.resolve(activeDetail);
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument());

    initialRequest.resolve(archivedDetail);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByText("Retired")).toBeNull();
  });
});
