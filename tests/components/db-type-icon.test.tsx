import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DbTypeIcon } from "@/components/blocks/db-type-icon";

describe("DbTypeIcon", () => {
  it("uses a bounded default size for database logo images", () => {
    render(<DbTypeIcon subtype="mysql" />);

    const icon = screen.getByRole("img", { name: "mysql" });

    expect(icon).toHaveClass("size-5");
    expect(icon).toHaveClass("object-contain");
  });

  it("allows callers to override the icon size", () => {
    render(<DbTypeIcon subtype="mysql" className="size-3.5" />);

    const icon = screen.getByRole("img", { name: "mysql" });

    expect(icon).toHaveClass("size-3.5");
    expect(icon).not.toHaveClass("size-5");
  });
});
