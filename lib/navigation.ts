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
    title: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
    description: "Operational posture and attention queue",
  },
  {
    title: "Resources",
    href: "/resources",
    icon: ServerCog,
    description: "Unified inventory and ownership context",
  },
  {
    title: "CMDB",
    href: "/cmdb",
    icon: FolderKanban,
    description: "Configuration maintenance over shared assets",
  },
  {
    title: "Databases",
    href: "/databases",
    icon: Database,
    description: "Instance and cluster-centric operational view",
  },
  {
    title: "Audits",
    href: "/audits",
    icon: Activity,
    description: "Recent baseline changes and operator actions",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Reference dictionaries, users, and roles",
  },
] as const;

export const environmentOptions = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
] as const;

export function getConsoleSectionTitle(pathname: string) {
  const item = consoleNavigation.find((entry) => pathname.startsWith(entry.href));

  return item?.title ?? "ControlHub";
}
