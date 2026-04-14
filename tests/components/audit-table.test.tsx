import { NextIntlClientProvider } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditTable } from "@/components/audits/audit-table";
import messages from "@/messages/en.json";
import type { AuditEventViewModel } from "@/types/view-models";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/audits",
  useSearchParams: () => new URLSearchParams("page=4&pageSize=25"),
}));

function renderTable() {
  const events: AuditEventViewModel[] = [
    {
      id: "audit-1",
      actorUserId: "user-1",
      actorLabel: "Platform Ops",
      targetResourceId: "resource-1",
      targetResourceName: "Orders API",
      environmentLabel: "Production",
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-14T10:00:00Z",
      summary: "Resource updated",
    },
  ];

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AuditTable
        events={events}
        pageInfo={{
          page: 4,
          pageSize: 25,
          totalItems: 100,
          totalPages: 4,
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe("AuditTable", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("shows known audit filter options even when the current page omits them", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Event type" }));

    expect(await screen.findByRole("option", { name: "Resource updated" })).toBeVisible();
    expect(await screen.findByRole("option", { name: "Resource created" })).toBeVisible();
    expect(await screen.findByRole("option", { name: "Relation created" })).toBeVisible();
  });

  it("updates eventType in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Event type" }));
    await user.click(
      await screen.findByRole("option", { name: "Resource updated" }),
    );

    expect(replace).toHaveBeenLastCalledWith(
      "/audits?page=1&pageSize=25&eventType=resource.updated",
    );
  });

  it("updates result in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Result" }));
    await user.click(await screen.findByRole("option", { name: "success" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/audits?page=1&pageSize=25&result=success",
    );
  });

  it("renders created timestamps using the active locale", () => {
    const expected = formatDateTime("2026-04-14T10:00:00Z", "en");

    renderTable();

    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
