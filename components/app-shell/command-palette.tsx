// input: react, next-intl, next/navigation, next-themes, auth-role, navigation registry, resource service, environment provider
// output: empty-query commands and bounded server-backed resource search with localized type, environment, and health context; create-resource command is admin-only
// pos: console quick-navigation overlay with role-gated mutation affordances
// note: if this file changes, update header and components/app-shell/README.md
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import * as RadixDialog from "@radix-ui/react-dialog";

import {
  Activity,
  Database,
  LayoutDashboard,
  Moon,
  Plus,
  ServerCog,
  Settings,
  Sun,
} from "lucide-react";

import { Command } from "cmdk";

import { useAdminRole } from "@/lib/auth-role";
import { consoleNavigation } from "@/lib/navigation";
import { localizeResourceType } from "@/lib/resource-summary";
import { listResources } from "@/services/resources";
import { useEnvironment } from "@/components/providers/environment-provider";
import type { Resource } from "@/types/resource";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  resources: ServerCog,
  databases: Database,
  audits: Activity,
  settings: Settings,
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const t = useTranslations();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const isAdmin = useAdminRole();
  const { environments } = useEnvironment();
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const searchGeneration = useRef(0);
  const isSearching = query.trim().length > 0;

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setResources([]);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    const search = query.trim();
    const generation = ++searchGeneration.current;

    if (!search) return;

    const timer = setTimeout(async () => {
      try {
        const response = await listResources({ q: search, pageSize: 10 });
        if (generation === searchGeneration.current) setResources(response.items);
      } catch {
        if (generation === searchGeneration.current) setResources([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange],
  );

  const environmentNames = useMemo(
    () => new Map(environments.map((environment) => [environment.id, environment.name])),
    [environments],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label={t("shell.openCommandPalette")}
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
    >
      <RadixDialog.Title className="sr-only">
        {t("shell.openCommandPalette")}
      </RadixDialog.Title>
      <div className="flex items-center border-b border-border px-3">
        <Command.Input
          className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={t("shell.searchPlaceholder")}
          onValueChange={handleQueryChange}
        />
      </div>
      <Command.List className="max-h-72 overflow-y-auto overflow-x-hidden p-1">
        <Command.Empty className="py-6 text-center text-sm">
          {t("common.noResults")}
        </Command.Empty>

        {!isSearching && (
          <Command.Group
            heading={t("navigation._label")}
            className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {consoleNavigation
              .filter((item) => isAdmin === true || !item.adminOnly)
              .map((item) => {
                const Icon = NAV_ICONS[item.id] ?? LayoutDashboard;
                return (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => runCommand(() => router.push(item.href))}
                    className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-selected:bg-muted data-selected:text-foreground"
                  >
                    <Icon className="size-4" />
                    {t(`navigation.${item.id}.title`)}
                  </Command.Item>
                );
              })}
          </Command.Group>
        )}

        {resources.length > 0 && (
          <Command.Group
            heading={t("navigation.resources.title")}
            className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {resources.map((resource) => (
              <Command.Item
                key={resource.id}
                value={resource.displayName}
                onSelect={() =>
                  runCommand(() => router.push(`/resources/${resource.id}`))
                }
                className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-selected:bg-muted data-selected:text-foreground"
              >
                <ServerCog className="size-4" />
                <span className="font-medium">{resource.displayName}</span>
                <span className="ml-auto flex gap-1 text-xs text-muted-foreground">
                  <span>{localizeResourceType(resource.resourceType, t)}</span>
                  <span>·</span>
                  <span>{environmentNames.get(resource.environmentId) ?? String(resource.environmentId)}</span>
                  <span>·</span>
                  <span>{t.has(`statusValues.${resource.healthStatus}`)
                    ? t(`statusValues.${resource.healthStatus}`)
                    : resource.healthStatus}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {!isSearching && <Command.Separator className="-mx-1 h-px bg-border" />}

        {!isSearching && <Command.Group
          heading={t("shell.workspace")}
          className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          {isAdmin === true && (
            <Command.Item
              value="create-resource"
              onSelect={() =>
                runCommand(() => {
                  window.dispatchEvent(
                    new CustomEvent("open-create-resource"),
                  );
                })
              }
              className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-selected:bg-muted data-selected:text-foreground"
            >
              <Plus className="size-4" />
              {t("common.actions.createResource")}
            </Command.Item>
          )}
        </Command.Group>}

        {!isSearching && <Command.Separator className="-mx-1 h-px bg-border" />}

        {!isSearching && <Command.Group
          heading={t("controls.theme.label")}
          className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <Command.Item
            value="theme-light"
            onSelect={() => runCommand(() => setTheme("light"))}
            className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-selected:bg-muted data-selected:text-foreground"
          >
            <Sun className="size-4" />
            {t("controls.theme.options.light")}
            {theme === "light" && (
              <span className="ml-auto text-xs text-muted-foreground">
                ✓
              </span>
            )}
          </Command.Item>
          <Command.Item
            value="theme-dark"
            onSelect={() => runCommand(() => setTheme("dark"))}
            className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-selected:bg-muted data-selected:text-foreground"
          >
            <Moon className="size-4" />
            {t("controls.theme.options.dark")}
            {theme === "dark" && (
              <span className="ml-auto text-xs text-muted-foreground">
                ✓
              </span>
            )}
          </Command.Item>
        </Command.Group>}
      </Command.List>
    </Command.Dialog>
  );
}
