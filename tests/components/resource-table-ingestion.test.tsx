// input: Vitest, Testing Library, resource table, translations, and mocked presentation role
// output: non-admin inventory ingestion-control visibility coverage
// pos: focused resource-table authorization-presentation seam for ingestion
// note: if this file changes, update this header and module README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResourceTable } from "@/components/resources/resource-table";
import messages from "@/messages/en.json";

vi.mock("@/lib/auth-role", () => ({ useAdminRole: () => false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/resources",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/resources/resource-detail-sheet-loader", () => ({ ResourceDetailSheetLoader: () => null }));

describe("ResourceTable ingestion control", () => {
  it("hides the inventory import control for editors while the server remains authoritative", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceTable resources={[]} pageInfo={{ page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }} resourceTypes={[]} lifecycleStatuses={[]} healthStatuses={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "Import inventory" })).toBeNull();
  });
});
