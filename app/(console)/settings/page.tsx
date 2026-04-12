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
            <div className="space-y-3">
              {environments.map((environment) => (
                <div
                  key={environment.id}
                  className="rounded-lg border border-border bg-background px-3 py-3"
                >
                  <p className="font-medium text-foreground">
                    {environment.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {environment.slug} · {environment.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DetailPanel>

        <DetailPanel
          title={t("pages.settings.owners.title")}
          description={t("pages.settings.owners.description")}
        >
          {owners.length === 0 ? (
            <EmptyState
              title={t("pages.settings.owners.emptyTitle")}
              description={t("pages.settings.owners.emptyDescription")}
            />
          ) : (
            <div className="space-y-3">
              {owners.map((owner) => (
                <div
                  key={owner.id}
                  className="rounded-lg border border-border bg-background px-3 py-3"
                >
                  <p className="font-medium text-foreground">{owner.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {owner.email}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DetailPanel>

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
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="rounded-lg border border-border bg-background px-3 py-3"
                >
                  <p className="font-medium text-foreground">{role.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role.description}
                  </p>
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
              <p className="font-medium text-foreground">{dictionary.key}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dictionary.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dictionary.values.map((value) => (
                  <span
                    key={value}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {value}
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
