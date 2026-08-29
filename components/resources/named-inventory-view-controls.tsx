// input: Next navigation URL state, named inventory view service, translations, visible columns
// output: personal saved-view save/apply controls for the resource inventory
// pos: inventory controls mounted ahead of ResourceTable filters
// note: if this file changes, update header and components/resources/README.md
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  createNamedInventoryView,
  listNamedInventoryViews,
} from "@/services/named-inventory-views";
import type {
  NamedInventoryView,
  NamedInventoryViewFilters,
} from "@/types/named-inventory-view";

type NamedInventoryViewControlsProps = {
  columns: string[];
};

function readFilters(searchParams: URLSearchParams): NamedInventoryViewFilters {
  const environmentId = searchParams.get("environmentId");
  const archiveFilter = searchParams.get("archiveFilter");

  return {
    ...(searchParams.get("q") ? { q: searchParams.get("q")! } : {}),
    ...(searchParams.getAll("resourceType").length
      ? { resourceType: searchParams.getAll("resourceType") }
      : {}),
    ...(searchParams.getAll("resourceSubtype").length
      ? { resourceSubtype: searchParams.getAll("resourceSubtype") }
      : {}),
    ...(environmentId && Number.isFinite(Number(environmentId))
      ? { environmentId: Number(environmentId) }
      : {}),
    ...(searchParams.getAll("lifecycleStatus").length
      ? { lifecycleStatus: searchParams.getAll("lifecycleStatus") }
      : {}),
    ...(searchParams.getAll("healthStatus").length
      ? { healthStatus: searchParams.getAll("healthStatus") }
      : {}),
    ...(archiveFilter === "includeArchived" || searchParams.get("includeArchived") === "true"
      ? { includeArchived: true }
      : {}),
    ...(archiveFilter === "archivedOnly" || searchParams.get("archivedOnly") === "true"
      ? { archivedOnly: true }
      : {}),
  };
}

export function NamedInventoryViewControls({ columns }: NamedInventoryViewControlsProps) {
  const t = useTranslations("tables.resources.savedViews");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<NamedInventoryView[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  const loadViews = async () => {
    try {
      setViews((await listNamedInventoryViews()).items);
      setError("");
    } catch {
      setError(t("loadError"));
    }
  };

  useEffect(() => {
    let active = true;

    void listNamedInventoryViews()
      .then((response) => {
        if (active) {
          setViews(response.items);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError(t("loadError"));
      });

    return () => {
      active = false;
    };
  }, [t]);

  const save = async () => {
    if (!name.trim()) return;

    try {
      setError("");
      await createNamedInventoryView({
        name: name.trim(),
        scope: "personal",
        state: {
          filters: readFilters(new URLSearchParams(searchParams.toString())),
          sort: { field: "name", direction: "asc" },
          columns,
        },
      });
      setName("");
    } catch {
      setError(t("saveError"));
      return;
    }

    await loadViews();
  };

  const apply = () => {
    const view = views.find((item) => item.id === Number(selectedId));
    if (!view) return;

    const params = new URLSearchParams();
    Object.entries(view.state.filters).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((item) => {
        params.append(key, String(item));
      });
    });
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="named-inventory-view">
        {t("selectLabel")}
      </label>
      <select
        id="named-inventory-view"
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="">{t("selectPlaceholder")}</option>
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.name}{view.scope === "shared" ? ` ${t("shared")}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="h-9 rounded-md border border-border px-3 text-sm"
        onClick={apply}
        disabled={!selectedId}
      >
        {t("apply")}
      </button>
      <label className="sr-only" htmlFor="named-inventory-view-name">
        {t("nameLabel")}
      </label>
      <input
        id="named-inventory-view-name"
        className="h-9 w-[180px] rounded-md border border-border bg-background px-3 text-sm"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("namePlaceholder")}
      />
      <button
        type="button"
        className="h-9 rounded-md border border-border px-3 text-sm"
        onClick={() => void save()}
      >
        {t("save")}
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
