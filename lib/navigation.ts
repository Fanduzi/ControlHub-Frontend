import {
  Activity,
  Database,
  LayoutDashboard,
  Settings,
  ServerCog,
} from "lucide-react";

export const consoleNavigation = [
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
    id: "audits",
    href: "/audits",
    icon: Activity,
    supportsEnvironment: false,
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

export type ConsoleSectionId = (typeof consoleNavigation)[number]["id"];

export function getConsoleSectionId(pathname: string) {
  const item = consoleNavigation.find((entry) => pathname.startsWith(entry.href));

  return item?.id;
}
