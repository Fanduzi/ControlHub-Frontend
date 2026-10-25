import { getTranslations } from "next-intl/server";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { AccentSwitcher } from "@/components/settings/accent-switcher";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import {
  listDictionaries,
  listEnvironments,
  listOwners,
  listRoles,
} from "@/services/settings";
import { OwnersSection } from "@/components/settings/owners-section";
import { QueryCredentialEntry } from "@/components/settings/query-credential-entry";
import { QueryDisclosureEntry } from "@/components/settings/query-disclosure-entry";
import { MachinePrincipalEntry } from "@/components/settings/machine-principal-entry";

function getDictionaryDescription(
  t: Awaited<ReturnType<typeof getTranslations>>,
  key: string,
  fallback: string,
): string {
  const i18nKey = `pages.settings.dictionaries.${key}`;
  return t.has(i18nKey) ? t(i18nKey) : fallback;
}

function getDictionaryKeyLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  key: string,
): string {
  const i18nKey = `pages.settings.dictionaries.${key}Label`;
  return t.has(i18nKey) ? t(i18nKey) : key;
}

function getDictionaryValueLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  value: string,
): string {
  const i18nKey = `dictionaryValues.${value}`;
  return t.has(i18nKey) ? t(i18nKey) : value;
}

export default async function SettingsPage() {
  const t = await getTranslations();
  const [environments, owners, roles, dictionaries] = await Promise.all([
    listEnvironments(),
    listOwners(),
    listRoles(),
    listDictionaries(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.settings.eyebrow")}
        title={t("pages.settings.title")}
        description={t("pages.settings.description")}
      />

      <DetailPanel
        title={t("pages.settings.appearance.title")}
        description={t("pages.settings.appearance.description")}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <p className="font-medium text-foreground">
              {t("pages.settings.appearance.languageTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pages.settings.appearance.languageDescription")}
            </p>
            <div className="mt-4">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <p className="font-medium text-foreground">
              {t("pages.settings.appearance.themeTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pages.settings.appearance.themeDescription")}
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <p className="font-medium text-foreground">
              {t("pages.settings.appearance.accentTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pages.settings.appearance.accentDescription")}
            </p>
            <div className="mt-4">
              <AccentSwitcher variant="inline" />
            </div>
          </div>
        </div>
      </DetailPanel>

      <DetailPanel
        title={t("pages.settings.queryCredentials.sectionTitle")}
        description={t("pages.settings.queryCredentials.sectionDescription")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <QueryCredentialEntry />
          <QueryDisclosureEntry />
          <MachinePrincipalEntry />
        </div>
      </DetailPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        <DetailPanel
          title={t("pages.settings.environments.title")}
          description={t("pages.settings.environments.description")}
        >
          {environments.length === 0 ? (
            <EmptyState
              title={t("pages.settings.environments.emptyTitle")}
              description={t("pages.settings.environments.emptyDescription")}
            />
          ) : (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {environments.map((environment) => (
                <div
                  key={environment.id}
                  className="flex items-baseline justify-between gap-2 px-1 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium text-foreground">
                    {environment.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {environment.slug} · {environment.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DetailPanel>

        <OwnersSection owners={owners} />

        <DetailPanel
          title={t("pages.settings.roles.title")}
          description={t("pages.settings.roles.description")}
        >
          {roles.length === 0 ? (
            <EmptyState
              title={t("pages.settings.roles.emptyTitle")}
              description={t("pages.settings.roles.emptyDescription")}
            />
          ) : (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-baseline justify-between gap-2 px-1 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium text-foreground">
                    {role.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {role.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DetailPanel>
      </div>

      <DetailPanel
        title={t("pages.settings.dictionaries.title")}
        description={t("pages.settings.dictionaries.description")}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {dictionaries.map((dictionary) => (
            <div
              key={dictionary.key}
              className="rounded-lg border border-border bg-background px-4 py-4"
            >
              <p className="font-medium text-foreground">{getDictionaryKeyLabel(t, dictionary.key)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getDictionaryDescription(t, dictionary.key, dictionary.description)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dictionary.values.map((value) => (
                  <span
                    key={value}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {getDictionaryValueLabel(t, value)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DetailPanel>
    </div>
  );
}
