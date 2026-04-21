"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { Input } from "@/components/ui/input";
import type { Owner } from "@/types/settings";

type OwnersSectionProps = {
  owners: Owner[];
};

export function OwnersSection({ owners }: OwnersSectionProps) {
  const t = useTranslations();
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return owners;
    const q = search.toLowerCase();
    return owners.filter(
      (owner) =>
        owner.name.toLowerCase().includes(q) ||
        owner.email.toLowerCase().includes(q),
    );
  }, [owners, search]);

  return (
    <DetailPanel
      title={t("pages.settings.owners.title")}
      description={t("pages.settings.owners.description")}
      actions={
        owners.length > 0 ? (
          showSearch ? (
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => {
                if (!search.trim()) setShowSearch(false);
              }}
              placeholder={t("pages.settings.owners.searchPlaceholder")}
              className="h-7 w-44 border-border bg-background text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Search className="size-3.5" />
            </button>
          )
        ) : undefined
      }
    >
      {owners.length === 0 ? (
        <EmptyState
          title={t("pages.settings.owners.emptyTitle")}
          description={t("pages.settings.owners.emptyDescription")}
        />
      ) : (
        <div className="max-h-80 divide-y divide-border overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("common.noResults")}
            </p>
          ) : (
            filtered.map((owner) => (
              <div
                key={owner.id}
                className="flex items-baseline justify-between gap-2 px-1 py-2 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium text-foreground">
                  {owner.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {owner.email}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </DetailPanel>
  );
}
