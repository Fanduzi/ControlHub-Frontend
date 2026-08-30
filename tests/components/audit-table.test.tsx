// input: AuditTable, URL search params, localized messages, Testing Library user interactions
// output: debounced URL-owned audit search/filtering, stable presets, localized timestamps, and field-diff rendering assertions
// pos: component-level regression contract for the operator audit table
// note: if this file changes, update header and components/audits/README.md

import { NextIntlClientProvider } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditTable } from "@/components/audits/audit-table";
import messages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";
import type { AuditEventViewModel } from "@/types/view-models";

let currentSearchParams = new URLSearchParams("page=4&pageSize=25");
const replace = vi.fn((url: string) => {
  currentSearchParams = new URL(url, "http://localhost").searchParams;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/audits",
  useSearchParams: () => currentSearchParams,
}));

function renderTable(locale = "en", localizedMessages: typeof messages = messages) {
  const events: AuditEventViewModel[] = [
    {
      id: 1,
      actorUserId: 1,
      actorLabel: "Platform Ops",
      targetResourceId: 1,
      targetResourceName: "Orders API",
      environmentLabel: "Production",
      eventType: "resource.updated",
      result: "success",
      changes: [
        {
          field: "identity.displayName",
          operation: "update",
          before: "Orders service",
          after: "Orders API",
        },
      ],
      createdAt: "2026-04-14T10:00:00Z",
      summary: "Resource updated",
    },
  ];

  return render(
    <NextIntlClientProvider locale={locale} messages={localizedMessages}>
      <AuditTable
        events={events}
        pageInfo={{
          page: 4,
          pageSize: 25,
          totalItems: 100,
          totalPages: 4,
          hasNextPage: false,
          hasPreviousPage: true,
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe("AuditTable", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    replace.mockClear();
    currentSearchParams = new URLSearchParams("page=4&pageSize=25");
  });

  it("shows known audit filter options even when the current page omits them", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("button", { name: "Event type" }));

    expect(await screen.findByRole("menuitemcheckbox", { name: "Resource updated" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Resource created" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Relation created" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Inventory profile updated" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Inventory relationship deleted" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Query.Executed" })).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Related Record Navigation" })).toBeVisible();
  });

  it("updates eventType in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("button", { name: "Event type" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Resource updated" }),
    );

    expect(replace).toHaveBeenLastCalledWith(
      "/audits?page=1&pageSize=25&eventType=resource.updated",
    );
  });

  it("updates result in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("button", { name: "Result" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "success" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/audits?page=1&pageSize=25&result=success",
    );
  });

  it("debounces URL-owned search so rapid typing navigates only the final value", () => {
    vi.useFakeTimers();
    currentSearchParams = new URLSearchParams(
      "page=4&pageSize=25&eventType=resource.updated&result=success&q=Admin",
    );

    renderTable();

    const searchInput = screen.getByRole("textbox");
    expect(searchInput).toHaveValue("Admin");

    fireEvent.change(searchInput, { target: { value: "O" } });
    currentSearchParams = new URLSearchParams(
      "page=1&pageSize=25&eventType=resource.updated&result=success&q=O",
    );
    fireEvent.change(searchInput, { target: { value: "Orders" } });

    // WHY: an old navigation response must not overwrite the newer local draft.
    expect(searchInput).toHaveValue("Orders");
    expect(replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/audits?page=1&pageSize=25&eventType=resource.updated&result=success&q=Orders",
    );
  });

  it("renders created timestamps using the active locale", () => {
    const expected = formatDateTime("2026-04-14T10:00:00Z", "en");

    renderTable();

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders recent timestamps with the active locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T10:01:00Z"));

    renderTable("zh-CN", zhMessages);

    expect(screen.getByText("1分钟前")).toBeInTheDocument();
  });

  it("shows server-owned field changes with before and after values", () => {
    renderTable();

    expect(screen.getByText("identity.displayName")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("Orders service")).toBeInTheDocument();
    expect(screen.getByText("Orders API", { selector: "code" })).toBeInTheDocument();
  });

  it("localizes the closed change operation vocabulary", () => {
    renderTable("zh-CN", zhMessages);

    expect(screen.getByText("更新")).toBeInTheDocument();
  });
});
