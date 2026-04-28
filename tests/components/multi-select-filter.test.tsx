import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MultiSelectFilter } from "@/components/blocks/multi-select-filter";
import messages from "@/messages/en.json";

function renderFilter(onValuesChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MultiSelectFilter
        label="Engine"
        options={[
          { value: "mysql", label: "Mysql" },
          { value: "clickhouse", label: "ClickHouse" },
        ]}
        selectedValues={[]}
        onValuesChange={onValuesChange}
      />
    </NextIntlClientProvider>,
  );

  return { onValuesChange };
}

describe("MultiSelectFilter", () => {
  it("closes the menu after selecting a filter value", async () => {
    const user = userEvent.setup();
    const { onValuesChange } = renderFilter();

    await user.click(screen.getByRole("button", { name: "Engine" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Mysql" }));

    await waitFor(() => {
      expect(onValuesChange).toHaveBeenCalledWith(["mysql"]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
