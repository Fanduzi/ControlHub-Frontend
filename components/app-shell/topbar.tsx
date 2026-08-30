// input: react, next-intl, environment/theme providers, auth-role
// output: console topbar identity/role controls, canonical environment navigation, fail-closed admin UI/sign-out
// pos: console shell chrome
// note: if this file changes, update header and components/app-shell/README.md

"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronsUpDown, Command, Menu, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AccentSwitcher } from "@/components/settings/accent-switcher";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { CommandPalette } from "@/components/app-shell/command-palette";
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
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useEnvironment } from "@/components/providers/environment-provider";
import { CreateResourceSheet } from "@/components/resources/create-resource-sheet";
import { consoleNavigation, getConsoleSectionId } from "@/lib/navigation";
import { useAdminRole } from "@/lib/auth-role";
import { parsePositiveDecimalInteger } from "@/lib/list-page-search-params";
import type { SealedSessionPayload } from "@/lib/operator-session/seal";

type TopbarProps = {
  pathname: string;
  onMobileMenuOpen?: () => void;
};

type OperatorIdentity = Pick<
  SealedSessionPayload,
  "email" | "displayName" | "role"
>;

export function Topbar({ pathname, onMobileMenuOpen }: TopbarProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [operator, setOperator] = useState<OperatorIdentity | null>(null);
  const isAdmin = useAdminRole();

  useEffect(() => {
    let active = true;
    void fetch("/api/operator-session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as {
          email?: unknown;
          displayName?: unknown;
          role?: unknown;
        };
        if (typeof body.role !== "string" || body.role.length === 0) {
          return null;
        }
        const email = typeof body.email === "string" ? body.email : undefined;
        const displayName =
          typeof body.displayName === "string" ? body.displayName : undefined;
        return email || displayName
          ? { email, displayName, role: body.role }
          : null;
      })
      .then((identity) => {
        if (active) setOperator(identity);
      })
      .catch(() => {
        if (active) setOperator(null);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    function handleOpenCreate() {
      if (isAdmin === true) {
        setShowCreate(true);
      }
    }
    window.addEventListener("open-create-resource", handleOpenCreate);
    return () =>
      window.removeEventListener("open-create-resource", handleOpenCreate);
  }, [isAdmin]);
  const sectionId = getConsoleSectionId(pathname);
  const sectionTitle = sectionId
    ? t(`navigation.${sectionId}.title`)
    : t("common.brand");
  const section = consoleNavigation.find((item) => item.id === sectionId);
  const operatorName = operator?.displayName || operator?.email || "—";
  const operatorRole = operator?.role || "—";
  const supportsEnvironment = section?.supportsEnvironment || pathname === "/settings/query-disclosure-policies";
  const { environments, currentEnvironmentId, setEnvironmentId } =
    useEnvironment();
  const urlEnvironmentSlug = searchParams.get("environment");
  const urlEnvironmentId = parsePositiveDecimalInteger(searchParams.get("environmentId") ?? undefined);
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
    ? (selectedEnvironmentFromUrl ?? urlEnvironmentId ?? (hasUnknownEnvironmentSlug ? null : currentEnvironmentId))
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
    const nextEnvironmentId = value === "all" || !value
      ? null
      : parsePositiveDecimalInteger(value) ?? null;
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

    if (pathname === "/topology") {
      params.delete("page");
      params.delete("rootId");
    } else {
      params.set("page", "1");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-background px-3 sm:h-16 sm:px-4 xl:px-5">
      {/* Mobile hamburger */}
      {onMobileMenuOpen && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 lg:hidden"
          aria-label={t("shell.openMobileMenu")}
          onClick={onMobileMenuOpen}
        >
          <Menu className="size-5" />
        </Button>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {sectionTitle}
        </p>
        <p className="mt-0.5 hidden max-w-2xl truncate text-sm text-foreground lg:block">
          {t("shell.subtitle")}
        </p>
      </div>

      {/* Desktop utilities */}
      <div className="hidden items-center gap-2 lg:flex">
        <Select
          value={selectedEnvironmentId === null ? "all" : String(selectedEnvironmentId)}
          onValueChange={handleEnvironmentChange}
        >
          <SelectTrigger className="h-8 min-w-28 border-border text-xs">
            {hasUnknownEnvironmentSlug
              ? t("common.unknown")
              : selectedEnvironmentId !== null
                ? (environments.find((e) => e.id === selectedEnvironmentId)
                    ?.name ?? String(selectedEnvironmentId))
                : t("environments.all")}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("environments.all")}</SelectItem>
            {environments.map((env) => (
              <SelectItem key={env.id} value={String(env.id)}>
                {env.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <LanguageSwitcher />
        <ThemeToggle />
        <AccentSwitcher />

        {isAdmin === true && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            {t("shell.quickAction")}
          </Button>
        )}

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("shell.notifications")}
              />
            }
          >
            <Bell className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" sideOffset={8}>
            <PopoverHeader>
              <PopoverTitle>{t("shell.notifications")}</PopoverTitle>
            </PopoverHeader>
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("shell.noNotifications")}
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Account menu (always visible) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="h-9 gap-1.5 px-2 sm:gap-2 sm:px-2.5"
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
              {operatorName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {operatorRole}
            </p>
          </div>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("shell.workspace")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPaletteOpen(true)}>
              <Command className="size-4" />
              {t("shell.openCommandPalette")}
            </DropdownMenuItem>
            {isAdmin === true && (
              <DropdownMenuItem className="lg:hidden" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" />
                {t("shell.quickAction")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {/* Mobile-only settings */}
          <div className="px-2 py-1.5 lg:hidden">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("shell.mobileSettings")}</p>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">{t("controls.theme.label")}</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">{t("controls.language.label")}</span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">{t("controls.accent.label")}</span>
              <AccentSwitcher />
            </div>
          </div>
          <DropdownMenuSeparator className="lg:hidden" />
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            {t("shell.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => {
              void (async () => {
                setSignOutFailed(false);
                let cleared = false;
                try {
                  const response = await fetch("/api/operator-session", {
                    method: "DELETE",
                    cache: "no-store",
                  });
                  cleared = response.ok;
                } catch {
                  cleared = false;
                }
                if (!cleared) {
                  // Fail-closed logout: the HttpOnly Operator Session cookie
                  // is still valid. Never present a logged-out console while
                  // the session survives — surface the controlled failure
                  // and let the operator retry.
                  setSignOutFailed(true);
                  return;
                }
                window.location.href = "/login";
              })();
            }}
          >
            {t("shell.signOut")}
          </DropdownMenuItem>
          {signOutFailed ? (
            <p
              role="alert"
              className="px-2 py-1.5 text-xs text-destructive"
            >
              {t("shell.signOutFailed")}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {showCreate && (
        <CreateResourceSheet open={showCreate} onOpenChange={setShowCreate} />
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
