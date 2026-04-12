import {
  Activity,
  Database,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ServerCog,
} from "lucide-react";

export const consoleNavigation = [
  {
    id: "overview",
    href: "/overview",
    icon: LayoutDashboard,
  },
  {
    id: "resources",
    href: "/resources",
    icon: ServerCog,
  },
  {
    id: "cmdb",
    href: "/cmdb",
    icon: FolderKanban,
  },
  {
    id: "databases",
    href: "/databases",
    icon: Database,
  },
  {
    id: "audits",
    href: "/audits",
    icon: Activity,
  },
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
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
