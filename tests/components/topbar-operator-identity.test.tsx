import type { ReactNode } from "react";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `translation:${key}`,
}));
vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments: [],
    currentEnvironmentId: null,
    setEnvironmentId: vi.fn(),
  }),
}));
vi.mock("@/lib/auth-role", () => ({ useAdminRole: () => false }));
vi.mock("@/components/settings/accent-switcher", () => ({
  AccentSwitcher: () => null,
}));
vi.mock("@/components/settings/language-switcher", () => ({
  LanguageSwitcher: () => null,
}));
vi.mock("@/components/settings/theme-toggle", () => ({
  ThemeToggle: () => null,
}));
vi.mock("@/components/app-shell/command-palette", () => ({
  CommandPalette: () => null,
}));
vi.mock("@/components/resources/create-resource-sheet", () => ({
  CreateResourceSheet: () => null,
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <div>{render}{children}</div>
  ),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <div>{render}{children}</div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { Topbar } from "@/components/app-shell/topbar";

describe("Topbar operator identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("renders identity and role from the BFF session, never the translation identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            email: "operator@example.com",
            role: "admin",
            token: "must-not-render",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<Topbar pathname="/overview" />);

    await waitFor(() => {
      expect(screen.getByText("operator@example.com")).toBeInTheDocument();
      expect(screen.getByText("admin")).toBeInTheDocument();
    });
    expect(screen.queryByText("translation:shell.userName")).not.toBeInTheDocument();
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
    expect(window.sessionStorage).toHaveLength(0);
  });
});
