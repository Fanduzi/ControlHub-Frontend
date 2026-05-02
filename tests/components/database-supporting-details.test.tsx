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
  it("renders supporting details wrapper and children", async () => {
    const { DatabaseSupportingDetails } = await import(
      "@/components/resources/database-supporting-details"
    );

    render(
      <DatabaseSupportingDetails>
        <section>Operational profile</section>
        <section>Relations</section>
        <section>Audit history</section>
      </DatabaseSupportingDetails>,
    );

    expect(screen.getByText("Supporting details")).toBeInTheDocument();
    expect(screen.getByText("Operational profile")).toBeInTheDocument();
    expect(screen.getByText("Relations")).toBeInTheDocument();
    expect(screen.getByText("Audit history")).toBeInTheDocument();
  });
});
