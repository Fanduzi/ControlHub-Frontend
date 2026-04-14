import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaginationControls } from "@/components/blocks/pagination-controls";
import messages from "@/messages/en.json";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/resources",
  useSearchParams: () => new URLSearchParams("q=orders&resourceType=service&page=2"),
}));

describe("PaginationControls", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("preserves existing filters when navigating to another page", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PaginationControls
          pageInfo={{
            page: 2,
            pageSize: 20,
            totalItems: 200,
            totalPages: 10,
          }}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(replace).toHaveBeenCalledWith("/resources?q=orders&resourceType=service&page=3");
  });

  it("updates pageSize and resets to the first page", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PaginationControls
          pageInfo={{
            page: 2,
            pageSize: 20,
            totalItems: 200,
            totalPages: 10,
          }}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(await screen.findByRole("option", { name: "50 / page" }));

    expect(replace).toHaveBeenCalledWith(
      "/resources?q=orders&resourceType=service&page=1&pageSize=50",
    );
  });

  it("includes the current pageSize even when it is not a default option", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PaginationControls
          pageInfo={{
            page: 4,
            pageSize: 25,
            totalItems: 250,
            totalPages: 10,
          }}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));

    expect(await screen.findByRole("option", { name: "25 / page" })).toBeVisible();
  });

  it("disables previous on the first page and next on the last page", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PaginationControls
          pageInfo={{
            page: 1,
            pageSize: 20,
            totalItems: 200,
            totalPages: 10,
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PaginationControls
          pageInfo={{
            page: 10,
            pageSize: 20,
            totalItems: 200,
            totalPages: 10,
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
