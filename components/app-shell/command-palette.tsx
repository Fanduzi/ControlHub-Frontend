"use client";

import { useCallback, useEffect } from "react";
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

import { consoleNavigation } from "@/lib/navigation";

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

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
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
        />
      </div>
      <Command.List className="max-h-72 overflow-y-auto overflow-x-hidden p-1">
        <Command.Empty className="py-6 text-center text-sm">
          {t("common.noResults")}
        </Command.Empty>

        <Command.Group
          heading={t("navigation._label")}
          className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          {consoleNavigation.map((item) => {
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

        <Command.Separator className="-mx-1 h-px bg-border" />

        <Command.Group
          heading={t("shell.workspace")}
          className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
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
        </Command.Group>

        <Command.Separator className="-mx-1 h-px bg-border" />

        <Command.Group
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
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
