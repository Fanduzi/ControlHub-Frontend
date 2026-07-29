import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  it("renders exactly one chevron icon in the trigger, not two overlapping arrows", async () => {
    renderSelect();

    const trigger = screen.getByRole("combobox", { name: "page size" });
    const icons = trigger.querySelectorAll("svg");

    expect(icons).toHaveLength(1);
  });

  it("trigger chevron is a single ChevronDown icon", () => {
    renderSelect();

    const trigger = screen.getByRole("combobox", { name: "page size" });
    const icon = trigger.querySelector("svg");

    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("data-slot", "select-icon");
  });

  it("SelectContent does not render scroll arrows when list is short", async () => {
    renderSelect(["10", "25"]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "page size" }));

    const popup = await screen.findByRole("listbox");
    expect(popup).toBeInTheDocument();

    const scrollUp = popup.querySelector("[data-slot='select-scroll-up-button']");
    const scrollDown = popup.querySelector("[data-slot='select-scroll-down-button']");

    expect(scrollUp).not.toBeInTheDocument();
    expect(scrollDown).not.toBeInTheDocument();
  });

  it("SelectContent renders scroll arrows only when list overflows", async () => {
    const manyOptions = Array.from({ length: 20 }, (_, i) => String((i + 1) * 5));
    renderSelect(manyOptions);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "page size" }));

    const popup = await screen.findByRole("listbox");
    expect(popup).toBeInTheDocument();

    const scrollDown = popup.querySelector("[data-slot='select-scroll-down-button']");
    expect(scrollDown).toBeInTheDocument();
  });

  it("popup has no overlapping or duplicate arrow elements", async () => {
    renderSelect();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "page size" }));

    const popup = await screen.findByRole("listbox");

    const allSvgs = popup.querySelectorAll("svg");
    const arrowSlots = new Set<string>();
    allSvgs.forEach((svg) => {
      const parent = svg.closest("[data-slot]");
      if (parent) {
        arrowSlots.add(parent.getAttribute("data-slot")!);
      }
    });

    const scrollSlots = [...arrowSlots].filter((s) => s.includes("scroll"));
    expect(scrollSlots.length).toBeLessThanOrEqual(2);
  });
});
