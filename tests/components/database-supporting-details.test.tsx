import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function t(key: string) {
  const keys: Record<string, string> = {
    "title": "Supporting details",
    "description": "Profile, relations, and audit history remain available below the operator view.",
  };
  return keys[key] ?? key;
}

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

describe("DatabaseSupportingDetails", () => {
  it("renders named slots with primary, secondary, and fullWidth", async () => {
    const { DatabaseSupportingDetails } = await import(
      "@/components/resources/database-supporting-details"
    );

    render(
      <DatabaseSupportingDetails
        primary={<section>Operational profile</section>}
        secondary={<section>Relations</section>}
        fullWidth={<section>Audit history</section>}
      />,
    );

    expect(screen.getByText("Supporting details")).toBeInTheDocument();
    expect(screen.getByText("Operational profile")).toBeInTheDocument();
    expect(screen.getByText("Relations")).toBeInTheDocument();
    expect(screen.getByText("Audit history")).toBeInTheDocument();
  });

  it("renders audit history in a full-width slot", async () => {
    const { DatabaseSupportingDetails } = await import(
      "@/components/resources/database-supporting-details"
    );

    render(
      <DatabaseSupportingDetails
        primary={<section>Profile</section>}
        secondary={<section>Relations</section>}
        fullWidth={<section>Audit history</section>}
      />,
    );

    expect(screen.getByTestId("database-supporting-primary")).toBeInTheDocument();
    expect(screen.getByTestId("database-supporting-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("database-supporting-full-width")).toHaveClass("xl:col-span-2");
  });
});
