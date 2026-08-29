// input: lucide-react
// output: console navigation registry with adminOnly markers; section id lookup
// pos: single navigation source consumed by sidebar, command palette, and topbar
// note: if this file changes, update header and lib/README.md
import {
  Activity,
  Database,
  LayoutDashboard,
  Network,
  Settings,
  ServerCog,
  SquareTerminal,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Console navigation entry. `adminOnly` items (audits) are hidden for
 * non-admin operators — presentation mirrors the server-owned access
 * matrix, which remains the authorization authority.
 */
export type ConsoleNavigationItem = {
  id: "overview" | "resources" | "databases" | "topology" | "query" | "audits" | "machinePrincipals" | "settings";
  href: string;
  icon: LucideIcon;
  supportsEnvironment: boolean;
  adminOnly?: true;
};

export const consoleNavigation: readonly ConsoleNavigationItem[] = [
  {
    id: "overview",
    href: "/overview",
    icon: LayoutDashboard,
    supportsEnvironment: true,
  },
  {
    id: "resources",
    href: "/resources",
    icon: ServerCog,
    supportsEnvironment: true,
  },
  {
    id: "databases",
    href: "/databases",
    icon: Database,
    supportsEnvironment: true,
  },
  {
    id: "topology",
    href: "/topology",
    icon: Network,
    supportsEnvironment: true,
  },
  {
    id: "query",
    href: "/query",
    icon: SquareTerminal,
    supportsEnvironment: true,
  },
  {
    id: "audits",
    href: "/audits",
    icon: Activity,
    supportsEnvironment: false,
    adminOnly: true,
  },
  {
    id: "machinePrincipals",
    href: "/settings/machine-principals",
    icon: KeyRound,
    supportsEnvironment: false,
    adminOnly: true,
  },
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
    supportsEnvironment: false,
  },
] as const;

export const environmentOptions = [
  { value: "production" },
  { value: "staging" },
  { value: "development" },
] as const;

export type ConsoleSectionId = ConsoleNavigationItem["id"];

export function getConsoleSectionId(pathname: string) {
  const item = consoleNavigation.find((entry) => pathname.startsWith(entry.href));

  return item?.id;
}
