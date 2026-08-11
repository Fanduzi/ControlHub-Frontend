// input: vitest, testing-library, command palette, auth-role
// output: command palette tests — create-resource command is admin-only; navigation renders for all operators
// pos: component tests for the console command palette affordance gating
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/app-shell/command-palette";
import messages from "@/messages/en.json";

let isAdmin = true;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "light" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderPalette() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CommandPalette open onOpenChange={() => undefined} />
    </NextIntlClientProvider>,
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    isAdmin = true;
  });

  it("shows the create-resource command for administrators", () => {
    renderPalette();

    expect(screen.getByText("New resource")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("hides the create-resource command for non-admin operators (server stays authoritative)", () => {
    isAdmin = false;

    renderPalette();

    expect(screen.queryByText("New resource")).toBeNull();
    // Read navigation stays available to every operator.
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });
});
