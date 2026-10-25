import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MachinePrincipalEntry } from "@/components/settings/machine-principal-entry";

let isAdmin: boolean | null = true;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

function renderEntry() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <MachinePrincipalEntry />
    </NextIntlClientProvider>,
  );
}

describe("MachinePrincipalEntry", () => {
  beforeEach(() => {
    isAdmin = true;
  });

  it("links administrators from Settings to lifecycle management", () => {
    renderEntry();

    expect(screen.getByRole("link", { name: /manage machine principals/i })).toHaveAttribute(
      "href",
      "/settings/machine-principals",
    );
  });

  it("does not expose the management link to non-administrators", () => {
    isAdmin = false;
    renderEntry();

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
  });
});
