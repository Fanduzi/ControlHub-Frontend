"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Loader2, Plus, Search, Trash2 } from "lucide-react";

import type {
  QuerySavedStatementRecord,
  QuerySavedStatementScope,
} from "@/types/query-saved-statement";
import {
  listSavedStatements,
  createSavedStatement,
  deleteSavedStatement,
  SavedStatementError,
} from "@/services/query-saved-statements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type QuerySavedStatementsProps = {
  targetResourceId: number;
  canManageSharedTemplates: boolean;
  currentStatement: string;
  onStatementLoad: (statement: string) => void;
  className?: string;
};

type SavedStatementsState = {
  status: "idle" | "loading" | "ready" | "error";
  items: QuerySavedStatementRecord[];
  error?: string;
  canManageSharedTemplates: boolean;
  page: number;
  totalPages: number;
};

export function QuerySavedStatements({
  targetResourceId,
  canManageSharedTemplates,
  currentStatement,
  onStatementLoad,
  className,
}: QuerySavedStatementsProps) {
  const t = useTranslations("queryWorkbench.savedStatements");
  const [state, setState] = useState<SavedStatementsState>({
    status: "idle",
    items: [],
    canManageSharedTemplates: false,
    page: 1,
    totalPages: 1,
  });
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch saved statements
  const fetchStatements = useCallback(
    async (page: number = 1) => {
      const generation = ++generationRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, status: "loading" }));

      try {
        const response = await listSavedStatements(targetResourceId, {
          q: searchDebounced || undefined,
          page,
          signal: controller.signal,
        });

        if (generationRef.current !== generation) return;

        setState({
          status: "ready",
          items: [...response.items],
          canManageSharedTemplates: response.canManageSharedTemplates,
          page: response.pageInfo.page,
          totalPages: response.pageInfo.totalPages,
        });
      } catch (error) {
        if (generationRef.current !== generation) return;
        if (
          error instanceof SavedStatementError &&
          error.code === "internal_error"
        ) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: t("error.loadFailed"),
          }));
        }
      }
    },
    [targetResourceId, searchDebounced, t],
  );

  // Fetch on mount and search change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStatements(1);
    return () => abortRef.current?.abort();
  }, [fetchStatements]);

  // Create statement
  const handleCreate = useCallback(
    async (scope: QuerySavedStatementScope) => {
      try {
        await createSavedStatement(targetResourceId, {
          name: t("defaultName"),
          statement: currentStatement,
          scope,
        });
        void fetchStatements(1);
      } catch {
        // Controlled error — toast or inline feedback can be added later.
      }
    },
    [targetResourceId, currentStatement, fetchStatements, t],
  );

  // Delete statement
  const [deleteDialog, setDeleteDialog] =
    useState<QuerySavedStatementRecord | null>(null);
  const handleDelete = useCallback(async () => {
    if (!deleteDialog) return;
    try {
      await deleteSavedStatement(targetResourceId, deleteDialog.id);
      setDeleteDialog(null);
      void fetchStatements(state.page);
    } catch {
      // Controlled error — toast or inline feedback can be added later.
    }
  }, [deleteDialog, targetResourceId, fetchStatements, state.page]);

  // Load statement into editor
  const handleLoad = useCallback(
    (statement: QuerySavedStatementRecord) => {
      onStatementLoad(statement.statement);
    },
    [onStatementLoad],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label={t("searchAriaLabel")}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCreate("personal")}
          aria-label={t("createPersonalAriaLabel")}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("createPersonal")}
        </Button>
        {state.canManageSharedTemplates && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCreate("shared_template")}
            aria-label={t("createSharedAriaLabel")}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createShared")}
          </Button>
        )}
      </div>

      {/* Content */}
      {state.status === "loading" && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ml-2">{t("loading")}</span>
        </div>
      )}

      {state.status === "error" && (
        <div className="p-4 text-sm text-destructive">{state.error}</div>
      )}

      {state.status === "ready" && state.items.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <div className="space-y-1">
          {state.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border p-2 hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  {item.scope === "shared_template" && (
                    <span className="rounded bg-secondary px-1 text-xs">
                      {t("sharedBadge")}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.statement}
                </div>
              </div>
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleLoad(item)}
                  aria-label={t("loadAriaLabel", { name: item.name })}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteDialog(item)}
                  aria-label={t("deleteAriaLabel", { name: item.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {state.status === "ready" && state.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={state.page <= 1}
            onClick={() => void fetchStatements(state.page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("pageInfo", { page: state.page, total: state.totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={state.page >= state.totalPages}
            onClick={() => void fetchStatements(state.page + 1)}
          >
            {t("next")}
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteDialog}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteDescription", {
                name: deleteDialog?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {t("confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
