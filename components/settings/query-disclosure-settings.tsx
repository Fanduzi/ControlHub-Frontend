"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type {
  DisclosurePolicy,
  DisclosurePolicyUpsertRequest,
} from "@/types/query-disclosure";
import {
  listDisclosurePolicies,
  createDisclosurePolicy,
  updateDisclosurePolicy,
  deleteDisclosurePolicy,
} from "@/services/query-disclosure";
import { getQueryTargets } from "@/services/query-targets";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { EmptyState } from "@/components/blocks/empty-state";
import { useAdminRole } from "@/lib/auth-role";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QueryDisclosureSettingsProps = {
  targets: QueryTarget[];
  pageInfo: PageInfo;
  environmentId?: number;
};

type PolicyFormData = {
  targetResourceId: number;
  databaseName: string;
  objectName: string;
  columnName: string;
  mode: "raw_copy_allowed" | "masked_no_copy";
};

const EMPTY_FORM: PolicyFormData = {
  targetResourceId: 0,
  databaseName: "",
  objectName: "",
  columnName: "",
  mode: "raw_copy_allowed",
};

type ModeOption = {
  readonly value: "raw_copy_allowed" | "masked_no_copy";
  readonly labelKey: string;
};

const MODE_OPTIONS: ModeOption[] = [
  { value: "raw_copy_allowed", labelKey: "modeRawCopyAllowed" },
  { value: "masked_no_copy", labelKey: "modeMaskedNoCopy" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Admin-only disclosure policy management surface (Phase 38Q).
 *
 * Follows the same hydration-safe admin gate pattern as
 * QueryCredentialSettings: SSR and first client render both produce the
 * loading skeleton. Non-admin users see a "managed by administrators"
 * message.
 */
export function QueryDisclosureSettings({
  targets,
  pageInfo,
  environmentId,
}: QueryDisclosureSettingsProps) {
  const t = useTranslations("queryDisclosureSettings");
  const isAdmin = useAdminRole();
  const tCommon = useTranslations("common");

  // --- Target selection ---
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(
    null,
  );
  const [targetList, setTargetList] = useState<QueryTarget[]>(targets);
  const [targetPageInfo, setTargetPageInfo] = useState<PageInfo>(pageInfo);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);

  const loadTargetPage = useCallback(
    async (page: number, q = targetSearch) => {
      if (environmentId === undefined) return;
      setTargetsLoading(true);
      setTargetLoadError(null);
      try {
        const response = await getQueryTargets({
          page,
          pageSize: targetPageInfo.pageSize,
          ...(q.trim() && { q: q.trim() }),
          ...(environmentId !== undefined && { environmentId }),
        });
        setTargetList(response.items);
        setTargetPageInfo(response.pageInfo);
      } catch {
        setTargetLoadError(t("targetLoadError"));
      } finally {
        setTargetsLoading(false);
      }
    },
    [environmentId, t, targetPageInfo.pageSize, targetSearch],
  );

  // --- Policy state ---
  const [policies, setPolicies] = useState<DisclosurePolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Dialog state ---
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<DisclosurePolicy | null>(
    null,
  );
  const [deletingPolicy, setDeletingPolicy] =
    useState<DisclosurePolicy | null>(null);
  const [formData, setFormData] = useState<PolicyFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // --- Fetch policies ---
  const fetchPolicies = useCallback(
    async (targetId: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await listDisclosurePolicies(targetId);
        setPolicies(response.items);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load policies",
        );
        setPolicies([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isAdmin && selectedTargetId !== null) {
      void fetchPolicies(selectedTargetId);
    }
  }, [isAdmin, selectedTargetId, fetchPolicies]);

  useEffect(() => {
    setTargetList(targets);
    setTargetPageInfo(pageInfo);
    setTargetSearch("");
  }, [pageInfo, targets]);

  // --- Auto-select first target ---
  useEffect(() => {
    if (isAdmin && targetList.length > 0 && selectedTargetId === null) {
      setSelectedTargetId(targetList[0].resourceId);
    }
  }, [isAdmin, targetList, selectedTargetId]);

  // --- Auto-clear feedback ---
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // --- Handlers ---
  function openCreateDialog() {
    setEditingPolicy(null);
    setFormData({
      ...EMPTY_FORM,
      targetResourceId: selectedTargetId ?? 0,
    });
    setFormDialogOpen(true);
  }

  function openEditDialog(policy: DisclosurePolicy) {
    setEditingPolicy(policy);
    setFormData({
      targetResourceId: policy.targetResourceId,
      databaseName: policy.databaseName,
      objectName: policy.objectName,
      columnName: policy.columnName,
      mode: policy.mode,
    });
    setFormDialogOpen(true);
  }

  function openDeleteDialog(policy: DisclosurePolicy) {
    setDeletingPolicy(policy);
    setDeleteDialogOpen(true);
  }

  async function handleSubmitForm() {
    if (!formData.databaseName.trim() || !formData.objectName.trim() || !formData.columnName.trim()) {
      return;
    }
    setSubmitting(true);
    const body: DisclosurePolicyUpsertRequest = {
      targetResourceId: formData.targetResourceId,
      databaseName: formData.databaseName.trim(),
      objectName: formData.objectName.trim(),
      columnName: formData.columnName.trim(),
      mode: formData.mode,
    };
    try {
      if (editingPolicy) {
        await updateDisclosurePolicy(body);
        setFeedback({ type: "success", message: t("updateSuccess") });
      } else {
        await createDisclosurePolicy(body);
        setFeedback({ type: "success", message: t("createSuccess") });
      }
      setFormDialogOpen(false);
      if (selectedTargetId !== null) {
        void fetchPolicies(selectedTargetId);
      }
    } catch (caught) {
      setFeedback({
        type: "error",
        message: caught instanceof Error ? caught.message : "Operation failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingPolicy) return;
    setSubmitting(true);
    try {
      await deleteDisclosurePolicy({
        targetResourceId: deletingPolicy.targetResourceId,
        databaseName: deletingPolicy.databaseName,
        objectName: deletingPolicy.objectName,
        columnName: deletingPolicy.columnName,
      });
      setFeedback({ type: "success", message: t("deleteSuccess") });
      setDeleteDialogOpen(false);
      setDeletingPolicy(null);
      if (selectedTargetId !== null) {
        void fetchPolicies(selectedTargetId);
      }
    } catch (caught) {
      setFeedback({
        type: "error",
        message: caught instanceof Error ? caught.message : "Delete failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // --- Hydration-safe loading state ---
  if (isAdmin === null) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }

  // --- Non-admin: restricted view ---
  if (!isAdmin) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <Shield className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {t("managedByAdmin")}
        </p>
      </div>
    );
  }

  // --- Admin: full management UI ---
  const selectedTarget = targetList.find(
    (target) => target.resourceId === selectedTargetId,
  );

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-sm",
            feedback.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
          )}
          {feedback.message}
        </div>
      )}

      {/* Target selector */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="disclosure-target-select"
          className="text-sm font-medium text-foreground"
        >
          {t("targetLabel")}
        </label>
        <div className="w-[280px] space-y-2">
          <Command shouldFilter={false} className="rounded-lg border border-input">
            <CommandInput
              id="disclosure-target-select"
              aria-label={t("targetLabel")}
              value={targetSearch}
              onValueChange={(value) => {
                setTargetSearch(value);
                void loadTargetPage(1, value);
              }}
              placeholder={selectedTarget?.displayName ?? t("targetSearchPlaceholder")}
              className="h-8 w-full bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-48 overflow-y-auto p-1">
              {targetList.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  {tCommon("noResults")}
                </p>
              ) : (
                targetList.map((target) => (
                  <CommandItem
                    key={target.resourceId}
                    value={target.displayName}
                    forceMount
                    onSelect={() => setSelectedTargetId(target.resourceId)}
                    className="cursor-default rounded px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                  >
                    {target.displayName}
                  </CommandItem>
                ))
              )}
            </CommandList>
          </Command>
          {targetLoadError && (
            <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
              <span>{targetLoadError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadTargetPage(targetPageInfo.page)}
              >
                {tCommon("actions.tryAgain")}
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {t("targetPage", {
                page: targetPageInfo.page,
                totalPages: targetPageInfo.totalPages,
                totalItems: targetPageInfo.totalItems,
              })}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={targetsLoading || !targetPageInfo.hasPreviousPage}
                onClick={() => void loadTargetPage(targetPageInfo.page - 1)}
              >
                {t("previousTargets")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={targetsLoading || !targetPageInfo.hasNextPage}
                onClick={() => void loadTargetPage(targetPageInfo.page + 1)}
              >
                {t("nextTargets")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Policy table */}
      {selectedTargetId !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h2>
            <Button type="button" size="sm" onClick={openCreateDialog}>
              <Plus className="size-3.5 mr-1.5" aria-hidden />
              {t("addColumn")}
            </Button>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex h-[200px] items-center justify-center rounded-xl border border-border bg-card">
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden
              />
            </div>
          ) : policies.length === 0 ? (
            <EmptyState
              title={t("emptyState")}
              description=""
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">{t("databaseLabel")}</th>
                    <th className="px-4 py-2.5">{t("objectLabel")}</th>
                    <th className="px-4 py-2.5">{t("columnLabel")}</th>
                    <th className="px-4 py-2.5">{t("modeLabel")}</th>
                    <th className="px-4 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {policies.map((policy) => (
                    <tr
                      key={policy.id}
                      className="hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                        {policy.databaseName}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                        {policy.objectName}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                        {policy.columnName}
                      </td>
                      <td className="px-4 py-2.5">
                        <ModeBadge mode={policy.mode} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(policy)}
                            aria-label={t("editColumn")}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(policy)}
                            aria-label={t("deleteColumn")}
                          >
                            <Trash2 className="size-3.5 text-destructive" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit dialog */}
      <PolicyFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editingPolicy={editingPolicy}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleSubmitForm}
        submitting={submitting}
        modeOptions={MODE_OPTIONS}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteColumn")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirm")}
          </p>
          {deletingPolicy && (
            <p className="rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
              {deletingPolicy.databaseName}.{deletingPolicy.objectName}.{deletingPolicy.columnName}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={submitting}
              onClick={() => void handleConfirmDelete()}
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                tCommon("actions.delete")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode badge
// ---------------------------------------------------------------------------

function ModeBadge({ mode }: { readonly mode: "raw_copy_allowed" | "masked_no_copy" }) {
  const t = useTranslations("queryDisclosureSettings");
  const isRaw = mode === "raw_copy_allowed";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isRaw
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {isRaw ? t("modeRawCopyAllowed") : t("modeMaskedNoCopy")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Policy Form Dialog
// ---------------------------------------------------------------------------

function PolicyFormDialog({
  open,
  onOpenChange,
  editingPolicy,
  formData,
  onFormDataChange,
  onSubmit,
  submitting,
  modeOptions,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingPolicy: DisclosurePolicy | null;
  readonly formData: PolicyFormData;
  readonly onFormDataChange: (data: PolicyFormData) => void;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
  readonly modeOptions: readonly ModeOption[];
}) {
  const t = useTranslations("queryDisclosureSettings");
  const tCommon = useTranslations("common");

  const isEditing = editingPolicy !== null;
  const canSubmit =
    formData.databaseName.trim() !== "" &&
    formData.objectName.trim() !== "" &&
    formData.columnName.trim() !== "" &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editColumn") : t("addColumn")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Database name */}
          <div>
            <label
              htmlFor="policy-database"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {t("databaseLabel")}
            </label>
            <Input
              id="policy-database"
              value={formData.databaseName}
              onChange={(e) =>
                onFormDataChange({ ...formData, databaseName: e.target.value })
              }
              placeholder="e.g. production"
              className="mt-1"
              disabled={isEditing}
            />
          </div>

          {/* Object name */}
          <div>
            <label
              htmlFor="policy-object"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {t("objectLabel")}
            </label>
            <Input
              id="policy-object"
              value={formData.objectName}
              onChange={(e) =>
                onFormDataChange({ ...formData, objectName: e.target.value })
              }
              placeholder="e.g. users"
              className="mt-1"
              disabled={isEditing}
            />
          </div>

          {/* Column name */}
          <div>
            <label
              htmlFor="policy-column"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {t("columnLabel")}
            </label>
            <Input
              id="policy-column"
              value={formData.columnName}
              onChange={(e) =>
                onFormDataChange({ ...formData, columnName: e.target.value })
              }
              placeholder="e.g. email"
              className="mt-1"
              disabled={isEditing}
            />
          </div>

          {/* Disclosure mode */}
          <div>
            <label
              htmlFor="policy-mode"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {t("modeLabel")}
            </label>
            <Select
              value={formData.mode}
              onValueChange={(v) =>
                onFormDataChange({
                  ...formData,
                  mode: v as "raw_copy_allowed" | "masked_no_copy",
                })
              }
            >
              <SelectTrigger id="policy-mode" className="mt-1">
                <span>
                  {t(
                    modeOptions.find((o) => o.value === formData.mode)
                      ?.labelKey ?? "modeRawCopyAllowed",
                  )}
                </span>
              </SelectTrigger>
              <SelectContent>
                {modeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {tCommon("actions.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : isEditing ? (
              tCommon("actions.save")
            ) : (
              t("addColumn")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
