import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";

function renderSelect(options: string[] = ["10", "25", "50", "100"], defaultValue = "25") {
  return render(
    <Select defaultValue={defaultValue}>
      <SelectTrigger aria-label="page size">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
  );
}

describe("Phase 38S: Select scroll arrow behavior", () => {
  it("renders exactly one chevron icon in the trigger", async () => {
    renderSelect();

    const trigger = screen.getByRole("combobox", { name: "page size" });
    const icons = trigger.querySelectorAll("svg");

    expect(icons).toHaveLength(1);
  });

  it("trigger chevron is a single icon", () => {
    renderSelect();

    const trigger = screen.getByRole("combobox", { name: "page size" });
    const icon = trigger.querySelector("svg");

    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("size-4");
  });

  it("popup never renders scroll arrows regardless of list length", async () => {
    const manyOptions = Array.from({ length: 20 }, (_, i) => String((i + 1) * 5));
    renderSelect(manyOptions);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "page size" }));

    const popup = await screen.findByRole("listbox");
    expect(popup).toBeInTheDocument();

    const scrollUp = popup.querySelector("[data-slot='select-scroll-up-button']");
    const scrollDown = popup.querySelector("[data-slot='select-scroll-down-button']");

    expect(scrollUp).not.toBeInTheDocument();
    expect(scrollDown).not.toBeInTheDocument();
  });

  it("long-option Select does not have overlapping popup arrows", async () => {
    const longOptions = Array.from({ length: 50 }, (_, i) => `Option ${i + 1} with a very long label that tests overflow behavior`);
    renderSelect(longOptions, "1");

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "page size" }));

    const popup = await screen.findByRole("listbox");
    expect(popup).toBeInTheDocument();

    const allSvgs = popup.querySelectorAll("svg");
    const arrowSlots = new Set<string>();
    allSvgs.forEach((svg) => {
      const parent = svg.closest("[data-slot]");
      if (parent) {
        arrowSlots.add(parent.getAttribute("data-slot")!);
      }
    });

    const scrollSlots = [...arrowSlots].filter((s) => s.includes("scroll"));
    expect(scrollSlots).toHaveLength(0);
  });
});

describe("Phase 38S: Paging i18n labels", () => {
  it("EN: pagination.pageSize renders correct label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Select defaultValue="25">
          <SelectTrigger aria-label={enMessages.pagination.pageSize}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
          </SelectContent>
        </Select>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeInTheDocument();
  });

  it("zh-CN: pagination.pageSize renders correct label", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCNMessages}>
        <Select defaultValue="25">
          <SelectTrigger aria-label={zhCNMessages.pagination.pageSize}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
          </SelectContent>
        </Select>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox", { name: "每页行数" })).toBeInTheDocument();
  });

  it("EN: pagination.pageIndicator formats correctly", () => {
    const indicator = enMessages.pagination.pageIndicator
      .replace("{page}", "3")
      .replace("{total}", "10");
    expect(indicator).toBe("Page 3 of 10");
  });

  it("zh-CN: pagination.pageIndicator formats correctly", () => {
    const indicator = zhCNMessages.pagination.pageIndicator
      .replace("{page}", "3")
      .replace("{total}", "10");
    expect(indicator).toBe("第 3 页，共 10 页");
  });

  it("EN: pagination.freshExecution label exists", () => {
    expect(enMessages.pagination.freshExecution).toBe("Fresh execution");
  });

  it("zh-CN: pagination.freshExecution label exists", () => {
    expect(zhCNMessages.pagination.freshExecution).toBe("重新执行");
  });

  it("EN: search and DDL control labels exist", () => {
    expect(enMessages.queryWorkbench.filters.searchControlLabel).toBe("Search targets");
    expect(enMessages.queryWorkbench.filters.ddlControlLabel).toBe("DDL / DML filter");
  });

  it("zh-CN: search and DDL control labels exist", () => {
    expect(zhCNMessages.queryWorkbench.filters.searchControlLabel).toBe("搜索目标");
    expect(zhCNMessages.queryWorkbench.filters.ddlControlLabel).toBe("DDL / DML 筛选");
  });
});
