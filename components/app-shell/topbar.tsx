"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronsUpDown, Command, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useEnvironment } from "@/components/providers/environment-provider";
import { CreateResourceSheet } from "@/components/resources/create-resource-sheet";
import { consoleNavigation, getConsoleSectionId } from "@/lib/navigation";

type TopbarProps = {
  pathname: string;
};

export function Topbar({ pathname }: TopbarProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const sectionId = getConsoleSectionId(pathname);
  const sectionTitle = sectionId
    ? t(`navigation.${sectionId}.title`)
    : t("common.brand");
  const section = consoleNavigation.find((item) => item.id === sectionId);
  const supportsEnvironment = section?.supportsEnvironment ?? false;
  const { environments, currentEnvironmentId, setEnvironmentId } =
    useEnvironment();
  const urlEnvironmentSlug = searchParams.get("environment");
  const urlEnvironmentId = searchParams.get("environmentId");
  const selectedEnvironmentFromUrl = environments.find(
    (environment) => environment.slug === urlEnvironmentSlug,
  )?.id;
  const hasUnknownEnvironmentSlug = Boolean(
    supportsEnvironment &&
      urlEnvironmentSlug &&
      !selectedEnvironmentFromUrl &&
      !urlEnvironmentId,
  );
  const selectedEnvironmentId = supportsEnvironment
    ? (selectedEnvironmentFromUrl ?? urlEnvironmentId ?? (hasUnknownEnvironmentSlug ? "" : currentEnvironmentId))
    : currentEnvironmentId;

  useEffect(() => {
    if (
      supportsEnvironment &&
      selectedEnvironmentId &&
      selectedEnvironmentId !== currentEnvironmentId
    ) {
      setEnvironmentId(selectedEnvironmentId);
    }
  }, [
    currentEnvironmentId,
    selectedEnvironmentId,
    setEnvironmentId,
    supportsEnvironment,
  ]);

  function handleEnvironmentChange(value: string | null) {
    const nextEnvironmentId = value === "all" ? "" : (value ?? "");
    const params = new URLSearchParams(searchParams.toString());
    const nextEnvironment = environments.find(
      (environment) => environment.id === nextEnvironmentId,
    );

    setEnvironmentId(nextEnvironmentId);

    params.delete("environmentId");

    if (!supportsEnvironment) {
      params.delete("environment");
      params.set("page", "1");
      const query = params.toString();

      router.replace(query ? `${pathname}?${query}` : pathname);
      return;
    }

    if (nextEnvironment?.slug) {
      params.set("environment", nextEnvironment.slug);
    } else {
      params.delete("environment");
    }

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

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
        <Select
          value={selectedEnvironmentId || "all"}
          onValueChange={handleEnvironmentChange}
        >
          <SelectTrigger className="h-8 min-w-28 border-border text-xs">
            {hasUnknownEnvironmentSlug
              ? t("common.unknown")
              : selectedEnvironmentId
                ? (environments.find((e) => e.id === selectedEnvironmentId)
                    ?.name ?? selectedEnvironmentId)
                : t("environments.all")}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("environments.all")}</SelectItem>
            {environments.map((env) => (
              <SelectItem key={env.id} value={env.id}>
                {env.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <LanguageSwitcher />
        <ThemeToggle />
        <AccentSwitcher />

        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          {t("shell.quickAction")}
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("shell.notifications")}
        >
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="h-9 gap-2 px-2.5"
                size="sm"
              />
            }
          >
            <Avatar className="size-6 rounded-md border border-border">
              <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                CH
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-medium text-foreground">
                {t("shell.userName")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("shell.role")}
              </p>
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
      {showCreate && (
        <CreateResourceSheet open={showCreate} onOpenChange={setShowCreate} />
      )}
    </header>
  );
}
