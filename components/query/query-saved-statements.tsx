// input: @/types/query-saved-statement, @/services/query-saved-statements, @/components/ui/*
// output: QuerySavedStatements component (terminal list generations, create/edit/delete with terminal delete state machine, shared-template affordance gate)
// pos: UI component for managing saved query statements within the query workbench
// note: if this file changes, update header and components/query/README.md
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Edit, Loader2, Plus, Search, Trash2, X } from "lucide-react";

import type {
  QuerySavedStatementRecord,
  QuerySavedStatementScope,
  QuerySavedStatementParameterDefinition,
  QuerySavedStatementParameterType,
} from "@/types/query-saved-statement";
import {
  listSavedStatements,
  createSavedStatement,
  updateSavedStatement,
  deleteSavedStatement,
  SavedStatementError,
} from "@/services/query-saved-statements";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Returns true when viewport >= 768px (md breakpoint). SSR/test-safe (defaults true). */
function useIsDesktop(): boolean {
  const query = useMemo(() => "(min-width: 768px)", []);
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(min-width: 768px)").matches;
    }
    return true;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

type QuerySavedStatementsProps = {
  targetResourceId: number;
  currentStatement: string;
  /** Passes the full authorized record so the editor can enter template mode
   * with the statement ID and parameter definitions. */
  onStatementLoad: (item: QuerySavedStatementRecord) => void;
  className?: string;
};

type SavedStatementsState = {
  status: "idle" | "loading" | "ready" | "error";
  items: QuerySavedStatementRecord[];
  error?: "forbidden" | "not_found" | "retryable";
  canManageSharedTemplates: boolean;
  page: number;
  totalPages: number;
};

type CreateDialogState = {
  open: boolean;
  scope: QuerySavedStatementScope;
  /** Ref to the button that triggered the dialog, for focus restoration. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

type EditDialogState = {
  item: QuerySavedStatementRecord;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
} | null;

type DeleteDialogState = {
  item: QuerySavedStatementRecord;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** True while a delete request is in flight: blocks dismissal and resubmit. */
  pending: boolean;
  /** Terminal delete error kept in the dialog. `forbidden` is non-retryable. */
  error?: "forbidden" | "retryable";
} | null;

export function QuerySavedStatements({
  targetResourceId,
  currentStatement,
  onStatementLoad,
  className,
}: QuerySavedStatementsProps) {
  const t = useTranslations("queryWorkbench.savedStatements");
  const isDesktop = useIsDesktop();
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
  const activeTargetRef = useRef(targetResourceId);
  const targetGenerationRef = useRef(0);
  const previousTargetRef = useRef(targetResourceId);
  if (activeTargetRef.current !== targetResourceId) {
    activeTargetRef.current = targetResourceId;
    targetGenerationRef.current += 1;
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch saved statements
  const fetchStatements = useCallback(
    async (page: number = 1) => {
      const generation = ++generationRef.current;
      const requestTarget = targetResourceId;
      const requestTargetGeneration = targetGenerationRef.current;
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

        if (
          generationRef.current !== generation ||
          activeTargetRef.current !== requestTarget ||
          targetGenerationRef.current !== requestTargetGeneration
        ) return;

        setState({
          status: "ready",
          items: [...response.items],
          canManageSharedTemplates: response.canManageSharedTemplates,
          page: response.pageInfo.page,
          totalPages: response.pageInfo.totalPages,
        });
      } catch (error) {
        if (
          generationRef.current !== generation ||
          activeTargetRef.current !== requestTarget ||
          targetGenerationRef.current !== requestTargetGeneration
        ) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          items: [],
          error:
            error instanceof SavedStatementError && error.code === "forbidden"
              ? "forbidden"
              : error instanceof SavedStatementError && error.code === "not_found"
                ? "not_found"
                : "retryable",
        }));
      }
    },
    [targetResourceId, searchDebounced],
  );

  // Fetch on mount and search change
  useEffect(() => {
    void fetchStatements(1);
    return () => abortRef.current?.abort();
  }, [fetchStatements]);

  // --- Focus restoration helper ---
  const restoreFocus = useCallback(
    (ref: React.RefObject<HTMLButtonElement | null>) => {
      requestAnimationFrame(() => {
        ref.current?.focus();
      });
    },
    [],
  );

  // --- Create dialog ---
  const [createDialog, setCreateDialog] = useState<CreateDialogState>({
    open: false,
    scope: "personal",
    triggerRef: { current: null },
  });
  const [createName, setCreateName] = useState("");
  const [createStatement, setCreateStatement] = useState("");
  const [createParameters, setCreateParameters] = useState<readonly QuerySavedStatementParameterDefinition[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const createHasDeclarationErrors = hasDeclarationErrors(createParameters);
  const createSubmitDisabled =
    createHasDeclarationErrors || createName.trim().length === 0;

  const handleCreateOpen = useCallback(
    (
      scope: QuerySavedStatementScope,
      triggerRef: React.RefObject<HTMLButtonElement | null>,
    ) => {
      setCreateName("");
      setCreateStatement(currentStatement);
      setCreateParameters([]);
      setCreateError(null);
      setCreateDialog({ open: true, scope, triggerRef });
    },
    [currentStatement],
  );

  const handleCreateClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setCreateDialog((prev) => ({ ...prev, open: false }));
        restoreFocus(createDialog.triggerRef);
      }
    },
    [createDialog.triggerRef, restoreFocus],
  );

  const handleCreateSubmit = useCallback(async () => {
    const requestTarget = targetResourceId;
    const requestTargetGeneration = targetGenerationRef.current;
    setCreateError(null);
    try {
      await createSavedStatement(requestTarget, {
        name: createName.trim(),
        statement: createStatement.trim(),
        scope: createDialog.scope,
        parameters: createParameters,
      });
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      setCreateDialog((prev) => ({ ...prev, open: false }));
      restoreFocus(createDialog.triggerRef);
      void fetchStatements(1);
    } catch (error) {
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      if (error instanceof SavedStatementError) {
        setCreateError(
          error.code === "validation_failed"
            ? t("error.validationFailed")
            : t("error.createFailed"),
        );
      } else {
        setCreateError(t("error.createFailed"));
      }
    }
  }, [
    createName,
    createStatement,
    createParameters,
    createDialog.scope,
    createDialog.triggerRef,
    targetResourceId,
    fetchStatements,
    restoreFocus,
    t,
  ]);

  // --- Delete dialog ---
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  /** Polite reconciliation announcement (deletion outcome, no-longer-exists). */
  const [announcement, setAnnouncement] = useState("");

  const handleDelete = useCallback(async () => {
    if (!deleteDialog || deleteDialog.pending) return;
    const requestTarget = targetResourceId;
    const requestTargetGeneration = targetGenerationRef.current;
    const item = deleteDialog.item;
    const triggerRef = deleteDialog.triggerRef;
    setDeleteDialog((prev) =>
      prev ? { ...prev, pending: true, error: undefined } : prev,
    );
    try {
      await deleteSavedStatement(requestTarget, item.id);
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      const lastRowOnLaterPage = state.items.length === 1 && state.page > 1;
      setDeleteDialog(null);
      restoreFocus(triggerRef);
      setAnnouncement(t("deleted", { name: item.name }));
      void fetchStatements(lastRowOnLaterPage ? state.page - 1 : state.page);
    } catch (error) {
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      if (error instanceof SavedStatementError && error.code === "not_found") {
        // Not a success: refresh the current list and announce absence.
        setDeleteDialog(null);
        restoreFocus(triggerRef);
        setAnnouncement(t("noLongerExists", { name: item.name }));
        void fetchStatements(state.page);
        return;
      }
      const retryable =
        !(error instanceof SavedStatementError && error.code === "forbidden");
      setDeleteDialog((prev) =>
        prev
          ? { ...prev, pending: false, error: retryable ? "retryable" : "forbidden" }
          : prev,
      );
    }
  }, [deleteDialog, targetResourceId, fetchStatements, state.page, state.items.length, restoreFocus, t]);

  // --- Edit dialog ---
  const [editDialog, setEditDialog] = useState<EditDialogState>(null);
  const [editName, setEditName] = useState("");
  const [editStatement, setEditStatement] = useState("");
  const [editParameters, setEditParameters] = useState<readonly QuerySavedStatementParameterDefinition[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (previousTargetRef.current === targetResourceId) return;
    previousTargetRef.current = targetResourceId;
    setSearch("");
    setSearchDebounced("");
    setState({
      status: "loading",
      items: [],
      canManageSharedTemplates: false,
      page: 1,
      totalPages: 1,
    });
    setCreateDialog((prev) => ({ ...prev, open: false }));
    setCreateError(null);
    setDeleteDialog(null);
    setEditDialog(null);
    setEditError(null);
  }, [targetResourceId]);

  const editHasDeclarationErrors = hasDeclarationErrors(editParameters);
  const editSubmitDisabled = editHasDeclarationErrors || editName.trim().length === 0;

  const handleEditOpen = useCallback(
    (
      item: QuerySavedStatementRecord,
      triggerRef: React.RefObject<HTMLButtonElement | null>,
    ) => {
      setEditDialog({ item, triggerRef });
      setEditName(item.name);
      setEditStatement(item.statement);
      setEditParameters(item.parameters);
      setEditError(null);
    },
    [],
  );

  const handleEditClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setEditDialog(null);
        if (editDialog) restoreFocus(editDialog.triggerRef);
      }
    },
    [editDialog, restoreFocus],
  );

  const handleEditSave = useCallback(async () => {
    if (!editDialog) return;
    const requestTarget = targetResourceId;
    const requestTargetGeneration = targetGenerationRef.current;
    setEditError(null);
    try {
      await updateSavedStatement(requestTarget, editDialog.item.id, {
        name: editName.trim(),
        statement: editStatement.trim(),
        parameters: editParameters,
      });
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      const triggerRef = editDialog.triggerRef;
      setEditDialog(null);
      restoreFocus(triggerRef);
      void fetchStatements(state.page);
    } catch (error) {
      if (
        activeTargetRef.current !== requestTarget ||
        targetGenerationRef.current !== requestTargetGeneration
      ) return;
      if (error instanceof SavedStatementError) {
        setEditError(
          error.code === "validation_failed"
            ? t("error.validationFailed")
            : t("error.updateFailed"),
        );
      } else {
        setEditError(t("error.updateFailed"));
      }
    }
  }, [editDialog, editName, editStatement, editParameters, targetResourceId, fetchStatements, state.page, restoreFocus, t]);

  // Load statement into editor
  const handleLoad = useCallback(
    (item: QuerySavedStatementRecord) => {
      onStatementLoad(item);
    },
    [onStatementLoad],
  );

  // Refs for create buttons (focus restoration)
  const createPersonalRef = useRef<HTMLButtonElement>(null);
  const createSharedRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Polite reconciliation announcements; never steals focus. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label={t("searchAriaLabel")}
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button
          ref={createPersonalRef}
          variant="outline"
          size="sm"
          disabled={state.status !== "ready"}
          onClick={() => handleCreateOpen("personal", createPersonalRef)}
          aria-label={t("createPersonalAriaLabel")}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("createPersonal")}
        </Button>
        {state.canManageSharedTemplates && (
          <Button
            ref={createSharedRef}
            variant="outline"
            size="sm"
            disabled={state.status !== "ready"}
            onClick={() =>
              handleCreateOpen("shared_template", createSharedRef)
            }
            aria-label={t("createSharedAriaLabel")}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createShared")}
          </Button>
        )}
        </div>
      </div>

      {/* Content */}
      {state.status === "loading" && (
        <div className="flex items-center justify-center p-4" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ml-2">{t("loading")}</span>
        </div>
      )}

      {state.status === "error" && (
        <div className="p-4 text-sm text-destructive" role="alert">
          {t(`error.${state.error}`)}
          {state.error === "retryable" && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => void fetchStatements(state.page)}
            >
              {t("retry")}
            </Button>
          )}
        </div>
      )}

      {state.status === "ready" && state.items.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>
      )}

      {(state.status === "ready" || state.status === "loading") && state.items.length > 0 && (
        <div className="space-y-1" aria-busy={state.status === "loading"}>
          {state.items.map((item) => (
            <SavedStatementRow
              key={item.id}
              item={item}
              canManageSharedTemplates={state.canManageSharedTemplates}
              disabled={state.status === "loading"}
              onLoad={handleLoad}
              onEdit={handleEditOpen}
              onDelete={(item, triggerRef) =>
                setDeleteDialog({ item, triggerRef, pending: false })
              }
              t={t}
            />
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

      {/* Delete confirmation dialog — terminal state machine */}
      <AlertDialog
        open={!!deleteDialog}
        onOpenChange={(open) => {
          if (!open && deleteDialog && !deleteDialog.pending) {
            const ref = deleteDialog.triggerRef;
            setDeleteDialog(null);
            restoreFocus(ref);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteDescription", {
                name: deleteDialog?.item.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteDialog?.error && (
            <div role="alert" className="text-sm text-destructive">
              {t(
                deleteDialog.error === "forbidden"
                  ? "error.deleteForbidden"
                  : "error.deleteRetryable",
              )}
            </div>
          )}
          <AlertDialogFooter>
            {deleteDialog?.error === "retryable" && (
              <Button
                variant="outline"
                onClick={() => void handleDelete()}
                disabled={deleteDialog.pending}
              >
                {t("retry")}
              </Button>
            )}
            <AlertDialogCancel disabled={deleteDialog?.pending}>
              {t("cancel")}
            </AlertDialogCancel>
            {!deleteDialog?.error && (
              <AlertDialogAction
                onClick={() => void handleDelete()}
                disabled={deleteDialog?.pending}
              >
                {deleteDialog?.pending ? t("deleting") : t("confirmDelete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create dialog — desktop Dialog / mobile Sheet */}
      {isDesktop ? (
      <Dialog open={createDialog.open} onOpenChange={handleCreateClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createDialog.scope === "personal"
                ? t("createPersonalTitle")
                : t("createSharedTitle")}
            </DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <CreateEditForm
            name={createName}
            onNameChange={setCreateName}
            statement={createStatement}
            onStatementChange={setCreateStatement}
            parameters={createParameters}
            onParametersChange={setCreateParameters}
            scope={createDialog.scope}
            error={createError}
            t={t}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateClose(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleCreateSubmit()} disabled={createSubmitDisabled}>
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      ) : (
      <Sheet open={createDialog.open} onOpenChange={handleCreateClose}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {createDialog.scope === "personal"
                ? t("createPersonalTitle")
                : t("createSharedTitle")}
            </SheetTitle>
            <SheetDescription>{t("createDescription")}</SheetDescription>
          </SheetHeader>
          <CreateEditForm
            name={createName}
            onNameChange={setCreateName}
            statement={createStatement}
            onStatementChange={setCreateStatement}
            parameters={createParameters}
            onParametersChange={setCreateParameters}
            scope={createDialog.scope}
            error={createError}
            t={t}
          />
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => handleCreateClose(false)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleCreateSubmit()} disabled={createSubmitDisabled}>
              {t("create")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      )}

      {/* Edit dialog — desktop Dialog / mobile Sheet */}
      {isDesktop ? (
      <Dialog
        open={!!editDialog}
        onOpenChange={(open) => {
          if (!open && editDialog) {
            const ref = editDialog.triggerRef;
            setEditDialog(null);
            restoreFocus(ref);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          <CreateEditForm
            name={editName}
            onNameChange={setEditName}
            statement={editStatement}
            onStatementChange={setEditStatement}
            parameters={editParameters}
            onParametersChange={setEditParameters}
            scope={editDialog?.item.scope ?? "personal"}
            error={editError}
            t={t}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleEditClose(false)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={editSubmitDisabled}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      ) : (
      <Sheet
        open={!!editDialog}
        onOpenChange={(open) => {
          if (!open && editDialog) {
            const ref = editDialog.triggerRef;
            setEditDialog(null);
            restoreFocus(ref);
          }
        }}
      >
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("editTitle")}</SheetTitle>
            <SheetDescription>{t("editDescription")}</SheetDescription>
          </SheetHeader>
          <CreateEditForm
            name={editName}
            onNameChange={setEditName}
            statement={editStatement}
            onStatementChange={setEditStatement}
            parameters={editParameters}
            onParametersChange={setEditParameters}
            scope={editDialog?.item.scope ?? "personal"}
            error={editError}
            t={t}
          />
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => handleEditClose(false)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={editSubmitDisabled}>{t("save")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      )}
    </div>
  );
}

// --- Sub-components ---

/** Row for a single saved statement in the list. */
function SavedStatementRow({
  item,
  canManageSharedTemplates,
  disabled,
  onLoad,
  onEdit,
  onDelete,
  t,
}: {
  item: QuerySavedStatementRecord;
  canManageSharedTemplates: boolean;
  disabled: boolean;
  onLoad: (item: QuerySavedStatementRecord) => void;
  onEdit: (
    item: QuerySavedStatementRecord,
    ref: React.RefObject<HTMLButtonElement | null>,
  ) => void;
  onDelete: (
    item: QuerySavedStatementRecord,
    ref: React.RefObject<HTMLButtonElement | null>,
  ) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center justify-between rounded-md border p-2 hover:bg-accent">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.name}</span>
          {item.scope === "shared_template" && (
            <span className="rounded bg-secondary px-1 text-xs">
              {t("sharedBadge")}
            </span>
          )}
          {item.parameters.length > 0 && (
            <span className="rounded bg-secondary px-1 text-xs">
              {t("parameterizedBadge")}
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
          disabled={disabled}
          onClick={() => onLoad(item)}
          aria-label={t("loadAriaLabel", { name: item.name })}
        >
          <Copy className="h-4 w-4" />
        </Button>
        {(item.scope !== "shared_template" || canManageSharedTemplates) && (
          <>
            <Button
              ref={editRef}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onEdit(item, editRef)}
              aria-label={t("editAriaLabel", { name: item.name })}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              ref={deleteRef}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onDelete(item, deleteRef)}
              aria-label={t("deleteAriaLabel", { name: item.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Shared form for create and edit dialogs. */
function CreateEditForm({
  name,
  onNameChange,
  statement,
  onStatementChange,
  parameters,
  onParametersChange,
  scope,
  error,
  t,
}: {
  name: string;
  onNameChange: (value: string) => void;
  statement: string;
  onStatementChange: (value: string) => void;
  parameters: readonly QuerySavedStatementParameterDefinition[];
  onParametersChange: (value: readonly QuerySavedStatementParameterDefinition[]) => void;
  scope: QuerySavedStatementScope;
  error: string | null;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium" htmlFor="saved-stmt-name">
          {t("nameLabel")}
        </label>
        <Input
          id="saved-stmt-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={120}
          placeholder={t("namePlaceholder")}
          aria-label={t("nameAriaLabel")}
        />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="saved-stmt-statement">
          {t("statementLabel")}
        </label>
        <textarea
          id="saved-stmt-statement"
          value={statement}
          onChange={(e) => onStatementChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={4}
          maxLength={16 * 1024}
          aria-label={t("statementAriaLabel")}
        />
      </div>
      <ParameterDeclarationsForm
        parameters={parameters}
        onParametersChange={onParametersChange}
        t={t}
      />
      <div className="text-xs text-muted-foreground">
        {t("scopeLabel")}:{" "}
        <span className="font-medium">
          {scope === "personal" ? t("scopePersonal") : t("scopeShared")}
        </span>
        <span className="ml-2">{t("scopeImmutable")}</span>
      </div>
      {error && (
        <div className="text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

const PARAMETER_TYPE_OPTIONS: readonly QuerySavedStatementParameterType[] = [
  "string",
  "integer",
  "decimal",
  "boolean",
];

const VALID_PARAM_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_PARAM_NAME_LENGTH = 64;
const MAX_SAVED_STATEMENT_PARAMETERS = 20;

function hasDeclarationErrors(parameters: readonly QuerySavedStatementParameterDefinition[]): boolean {
  if (parameters.length > MAX_SAVED_STATEMENT_PARAMETERS) return true;
  const names = parameters.map((p) => p.name);
  return names.some((name) => name.length === 0 || !VALID_PARAM_NAME_RE.test(name) || name.length > MAX_PARAM_NAME_LENGTH)
    || new Set(names).size !== names.length;
}

function ParameterDeclarationsForm({
  parameters,
  onParametersChange,
  t,
}: {
  parameters: readonly QuerySavedStatementParameterDefinition[];
  onParametersChange: (value: readonly QuerySavedStatementParameterDefinition[]) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const [rowKeys, setRowKeys] = useState<string[]>(() =>
    parameters.map(() => crypto.randomUUID()),
  );

  // Detect external parameter resets (dialog open with pre-existing params)
  // vs internal changes (add/remove/edit initiated by this component).
  // Refs are safe inside effects; the selfInitiated flag prevents false resets
  // when onParametersChange triggers a re-render with a new parameters array.
  const selfInitiatedRef = useRef(false);
  const prevParamsRef = useRef(parameters);
  useEffect(() => {
    if (prevParamsRef.current !== parameters && !selfInitiatedRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRowKeys(parameters.map(() => crypto.randomUUID()));
    }
    selfInitiatedRef.current = false;
    prevParamsRef.current = parameters;
  }, [parameters]);

  function handleAdd() {
    selfInitiatedRef.current = true;
    onParametersChange([...parameters, { name: "", type: "string" }]);
    setRowKeys((prev) => [...prev, crypto.randomUUID()]);
  }

  function handleRemove(index: number) {
    selfInitiatedRef.current = true;
    onParametersChange(parameters.filter((_, i) => i !== index));
    setRowKeys((prev) => prev.filter((_, i) => i !== index));
  }

  function handleNameChange(index: number, value: string) {
    selfInitiatedRef.current = true;
    onParametersChange(
      parameters.map((p, i) => (i === index ? { ...p, name: value } : p)),
    );
  }

  function handleTypeChange(index: number, value: QuerySavedStatementParameterType) {
    selfInitiatedRef.current = true;
    onParametersChange(
      parameters.map((p, i) => (i === index ? { ...p, type: value } : p)),
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t("parametersSectionTitle")}
          <span className="ml-1 text-xs text-muted-foreground">
            ({parameters.length}/{MAX_SAVED_STATEMENT_PARAMETERS})
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={parameters.length >= MAX_SAVED_STATEMENT_PARAMETERS}
          aria-label={t("addParameter")}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addParameter")}
        </Button>
      </div>
      {parameters.length > MAX_SAVED_STATEMENT_PARAMETERS && (
        <p className="text-[11px] text-destructive" role="alert">
          {t("parameterTooMany", { max: String(MAX_SAVED_STATEMENT_PARAMETERS) })}
        </p>
      )}
      {parameters.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noParameters")}</p>
      )}
      {parameters.map((param, index) => {
        const nameEmpty = param.name.trim().length === 0;
        const nameInvalid = !nameEmpty && !VALID_PARAM_NAME_RE.test(param.name);
        const nameTooLong = param.name.length > MAX_PARAM_NAME_LENGTH;
        const duplicateName =
          !nameEmpty &&
          parameters.filter((p) => p.name === param.name).length > 1;
        const hasError = nameEmpty || nameInvalid || nameTooLong || duplicateName;

        return (
          <div
            key={rowKeys[index]}
            className="flex items-start gap-2"
            data-testid={`parameter-row-${index}`}
          >
            <div className="flex-1 space-y-0.5">
              <Input
                value={param.name}
                onChange={(e) => handleNameChange(index, e.target.value)}
                placeholder={t("parameterNamePlaceholder")}
                maxLength={MAX_PARAM_NAME_LENGTH}
                aria-label={t("parameterNameLabel")}
                aria-invalid={hasError || undefined}
                className="h-8 text-xs"
              />
              {hasError && (
                <p className="text-[11px] text-destructive" role="alert">
                  {nameEmpty
                    ? t("parameterNameEmpty")
                    : nameInvalid
                      ? t("parameterNameInvalid")
                      : nameTooLong
                        ? t("parameterNameTooLong")
                        : duplicateName
                          ? t("parameterNameDuplicate")
                          : ""}
                </p>
              )}
            </div>
            <select
              value={param.type}
              onChange={(e) =>
                handleTypeChange(
                  index,
                  e.target.value as QuerySavedStatementParameterType,
                )
              }
              aria-label={t("parameterTypeLabel")}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PARAMETER_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`parameterType${opt.charAt(0).toUpperCase()}${opt.slice(1)}`)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(index)}
              aria-label={t("removeParameter")}
              className="h-8 w-8 shrink-0 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
