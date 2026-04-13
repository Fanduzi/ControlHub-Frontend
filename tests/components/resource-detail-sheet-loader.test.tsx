import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";

import { ResourceDetailSheetLoader } from "@/components/resources/resource-detail-sheet-loader";
import { getResourceViewModel } from "@/lib/view-models";
import messages from "@/messages/en.json";

vi.mock("@/lib/view-models", () => ({
  getResourceViewModel: vi.fn(),
}));

const mockedGetResourceViewModel = vi.mocked(getResourceViewModel);

const resource = {
  id: "res-db-primary",
  resourceType: "database_instance" as const,
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: "env-prod",
  environmentName: "Production",
  ownerId: "owner-dba",
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
};

describe("ResourceDetailSheetLoader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    mockedGetResourceViewModel.mockResolvedValue({
      ...resource,
      profile: {
        engine: "MySQL 8.0",
        endpoint: "orders-primary.internal:3306",
      },
      relations: [],
      auditEvents: [],
    });

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
});
