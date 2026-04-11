import { render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/app-shell/sidebar";

describe("Sidebar", () => {
  it("renders the console navigation groups in the agreed order", () => {
    render(<Sidebar pathname="/resources" />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/resources",
    );
    expect(screen.getByRole("link", { name: "CMDB" })).toHaveAttribute(
      "href",
      "/cmdb",
    );
    expect(screen.getByRole("link", { name: "Databases" })).toHaveAttribute(
      "href",
      "/databases",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("marks the active route for the current console section", () => {
    render(<Sidebar pathname="/resources" />);

    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
