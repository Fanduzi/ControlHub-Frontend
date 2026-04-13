"use client";

import { Bell, ChevronsUpDown, Command, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AccentSwitcher } from "@/components/settings/accent-switcher";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { environmentOptions, getConsoleSectionId } from "@/lib/navigation";

type TopbarProps = {
  pathname: string;
};

export function Topbar({ pathname }: TopbarProps) {
  const t = useTranslations();
  const sectionId = getConsoleSectionId(pathname);
  const sectionTitle = sectionId
    ? t(`navigation.${sectionId}.title`)
    : t("common.brand");

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-border bg-background px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-5 xl:py-0">
      <div className="min-w-0 xl:flex-1">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {sectionTitle}
        </p>
        <p className="mt-1 hidden max-w-2xl truncate text-sm text-foreground lg:block">
          {t("shell.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <label className="relative hidden min-[980px]:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-64 border-border bg-card pl-9 text-sm"
            placeholder={t("shell.searchPlaceholder")}
          />
        </label>

        <Select defaultValue="production">
          <SelectTrigger className="h-9 w-[148px] border-border bg-card text-sm">
            <SelectValue placeholder={t("shell.environmentPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {environmentOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`environments.${option.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <LanguageSwitcher />
        <ThemeToggle />
        <AccentSwitcher />

        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="size-4" />
          {t("shell.quickAction")}
        </Button>

        <Button variant="outline" size="icon-sm" aria-label={t("shell.notifications")}>
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="h-9 gap-2 px-2.5" size="sm" />
          }
        >
          <Avatar className="size-6 rounded-md border border-border">
            <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
              CH
            </AvatarFallback>
          </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-medium text-foreground">{t("shell.userName")}</p>
              <p className="text-[11px] text-muted-foreground">{t("shell.role")}</p>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("shell.workspace")}</DropdownMenuLabel>
              <DropdownMenuItem>
                <Command className="size-4" />
                {t("shell.openCommandPalette")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>{t("shell.profile")}</DropdownMenuItem>
            <DropdownMenuItem>{t("shell.signOut")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
