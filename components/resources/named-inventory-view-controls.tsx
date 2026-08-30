// input: Next navigation URL state, named inventory view service, translations, visible columns
// output: personal/shared saved-view save with repeated environment scopes, apply, and management controls for the resource inventory
// pos: inventory controls mounted ahead of ResourceTable filters
// note: if this file changes, update header and components/resources/README.md
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  createNamedInventoryView,
  deleteNamedInventoryView,
  listNamedInventoryViews,
  updateNamedInventoryView,
} from "@/services/named-inventory-views";
import type {
  NamedInventoryView,
  NamedInventoryViewFilters,
  NamedInventoryViewScope,
} from "@/types/named-inventory-view";

type NamedInventoryViewControlsProps = {
  columns: string[];
  onApplyColumns: (columns: string[]) => void;
};

function readFilters(searchParams: URLSearchParams): NamedInventoryViewFilters {
  const environmentIds = searchParams.getAll("environmentId")
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const ownerId = Number(searchParams.get("ownerId"));
  const archiveFilter = searchParams.get("archiveFilter");

  return {
    ...(searchParams.get("q") ? { q: searchParams.get("q")! } : {}),
    ...(searchParams.getAll("resourceType").length
      ? { resourceType: searchParams.getAll("resourceType") }
      : {}),
    ...(searchParams.getAll("resourceSubtype").length
      ? { resourceSubtype: searchParams.getAll("resourceSubtype") }
      : {}),
    ...(environmentIds.length
      ? { environmentId: environmentIds }
      : {}),
    ...(searchParams.getAll("lifecycleStatus").length
      ? { lifecycleStatus: searchParams.getAll("lifecycleStatus") }
      : {}),
    ...(searchParams.getAll("healthStatus").length
      ? { healthStatus: searchParams.getAll("healthStatus") }
      : {}),
    ...(Number.isSafeInteger(ownerId) && ownerId > 0
      ? { ownerId }
      : {}),
    ...(searchParams.getAll("label").length
      ? { label: searchParams.getAll("label") }
      : {}),
    ...(archiveFilter === "includeArchived" || searchParams.get("includeArchived") === "true"
      ? { includeArchived: true }
      : {}),
    ...(archiveFilter === "archivedOnly" || searchParams.get("archivedOnly") === "true"
      ? { archivedOnly: true }
      : {}),
  };
}

export function NamedInventoryViewControls({ columns, onApplyColumns }: NamedInventoryViewControlsProps) {
  const t = useTranslations("tables.resources.savedViews");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<NamedInventoryView[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<NamedInventoryViewScope>("personal");
  const [selectedId, setSelectedId] = useState("");
  const [renameName, setRenameName] = useState("");
  const [canManageShared, setCanManageShared] = useState(false);
  const [error, setError] = useState("");

  const loadViews = async () => {
    try {
      const response = await listNamedInventoryViews();
      setViews(response.items);
      setCanManageShared(response.canManageShared);
      setError("");
    } catch {
      setError(t("loadError"));
    }
  };

  useEffect(() => {
    let active = true;

    void listNamedInventoryViews()
      .then((response) => {
        if (!active) return;
        setViews(response.items);
        setCanManageShared(response.canManageShared);
        setError("");
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
        scope: canManageShared ? scope : "personal",
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

  const selectedView = views.find((item) => item.id === Number(selectedId));
  const canManageSelectedView = selectedView?.scope !== "shared" || canManageShared;

  const rename = async () => {
    if (!selectedView || !renameName.trim() || !canManageSelectedView) return;

    try {
      setError("");
      await updateNamedInventoryView(selectedView.id, {
        name: renameName.trim(),
        state: selectedView.state,
      });
    } catch {
      setError(t("renameError"));
      return;
    }

    await loadViews();
  };

  const remove = async () => {
    if (!selectedView || !canManageSelectedView) return;

    try {
      setError("");
      await deleteNamedInventoryView(selectedView.id);
    } catch {
      setError(t("deleteError"));
      return;
    }

    setSelectedId("");
    setRenameName("");
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
    onApplyColumns(view.state.columns);
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
        onChange={(event) => {
          const view = views.find((item) => item.id === Number(event.target.value));
          setSelectedId(event.target.value);
          setRenameName(view?.name ?? "");
        }}
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
      {canManageShared && (
        <>
          <label className="sr-only" htmlFor="named-inventory-view-scope">
            {t("scopeLabel")}
          </label>
          <select
            id="named-inventory-view-scope"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={scope}
            onChange={(event) => setScope(event.target.value as NamedInventoryViewScope)}
          >
            <option value="personal">{t("personal")}</option>
            <option value="shared">{t("sharedScope")}</option>
          </select>
        </>
      )}
      <button
        type="button"
        className="h-9 rounded-md border border-border px-3 text-sm"
        onClick={() => void save()}
      >
        {t("save")}
      </button>
      {selectedView && (
        <>
          <label className="sr-only" htmlFor="named-inventory-view-rename">
            {t("renameLabel")}
          </label>
          <input
            id="named-inventory-view-rename"
            className="h-9 w-[180px] rounded-md border border-border bg-background px-3 text-sm"
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            disabled={!canManageSelectedView}
          />
          <button
            type="button"
            className="h-9 rounded-md border border-border px-3 text-sm"
            onClick={() => void rename()}
            disabled={!canManageSelectedView || !renameName.trim()}
            aria-describedby={!canManageSelectedView ? "named-inventory-view-admin-required" : undefined}
          >
            {t("rename")}
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-border px-3 text-sm"
            onClick={() => void remove()}
            disabled={!canManageSelectedView}
            aria-describedby={!canManageSelectedView ? "named-inventory-view-admin-required" : undefined}
          >
            {t("delete")}
          </button>
          {!canManageSelectedView && (
            <p id="named-inventory-view-admin-required" className="text-sm text-muted-foreground">
              {t("adminRequired")}
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
