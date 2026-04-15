import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatabaseTable } from "@/components/databases/database-table";
import { formatDateTime } from "@/lib/format";
import messages from "@/messages/en.json";
import type { ResourceListViewModel } from "@/types/view-models";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/databases",
  useSearchParams: () => new URLSearchParams("environmentId=env-prod&page=1"),
}));

vi.mock("@/components/resources/resource-detail-sheet-loader", () => ({
  ResourceDetailSheetLoader: () => null,
}));

describe("DatabaseTable", () => {
  it("renders updated timestamps using the active locale", () => {
    const resources: ResourceListViewModel[] = [
      {
        id: "resource-1",
        resourceType: "database_instance",
        resourceSubtype: "mysql",
        name: "orders-primary",
        displayName: "Orders MySQL Primary",
        environmentId: "env-prod",
        ownerId: "owner-dba",
        ownerName: "DBA Team",
        environmentName: "Production",
        lifecycleStatus: "running",
        healthStatus: "healthy",
        source: "manual",
        externalId: "db:orders-primary",
        labels: {},
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:00:00Z",
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        isArchived: false,
        summary: "Orders primary database",
      },
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable
          resources={resources}
          pageInfo={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(formatDateTime("2026-04-14T10:00:00Z", "en")),
    ).toBeInTheDocument();
  });
});
