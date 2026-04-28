import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResourceLink } from "@/components/blocks/resource-link";

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("ResourceLink must not use Next Link");
  },
}));

describe("ResourceLink", () => {
  it("renders a native anchor so table links keep working after sheet teardown", () => {
    render(<ResourceLink href="/resources/1">Orders Cluster</ResourceLink>);

    const link = screen.getByRole("link", { name: "Orders Cluster" });
    expect(link).toHaveAttribute("href", "/resources/1");
  });
});
