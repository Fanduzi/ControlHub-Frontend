"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link,
  Loader2,
  Search,
  Shield,
  Unlink,
  XCircle,
} from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type {
  QueryCredentialEnvironmentPolicy,
  QueryCredentialRuntimeStatus,
  QueryCredentialStatusResponse,
  QueryCredentialUpsertRequest,
} from "@/types/query-credential";
import {
  deleteQueryCredential,
  getQueryCredential,
  saveQueryCredential,
} from "@/services/query-credentials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { EmptyState } from "@/components/blocks/empty-state";
import { formatHostPortLabel } from "@/lib/query-target-display";
import { cn } from "@/lib/utils";

type QueryCredentialSettingsProps = {
  targets: QueryTarget[];
};

export function QueryCredentialSettings({
  targets,
}: QueryCredentialSettingsProps) {
  const t = useTranslations("queryCredentialSettings");
  const [search, setSearch] = useState("");
  const [activeTargetId, setActiveTargetId] = useState<number | null>(null);

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target) => {
      const haystack = [
        target.displayName,
        target.resourceName,
        target.connectionContext.engine,
        target.connectionContext.host,
        target.connectionContext.environment,
        target.connectionContext.clusterName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [targets, search]);

  const activeTarget = useMemo(
    () =>
      filteredTargets.find((t) => t.resourceId === activeTargetId) ?? null,
    [filteredTargets, activeTargetId],
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      {/* Left panel: target list */}
      <aside className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredTargets.length === 0 ? (
            targets.length === 0 ? (
              <EmptyState
                title={t("targetList.emptyTitle")}
                description={t("targetList.emptyDescription")}
              />
            ) : (
              <EmptyState
                title={t("targetList.emptyFilterTitle")}
                description={t("targetList.emptyFilterDescription")}
              />
            )
          ) : (
            <ul className="divide-y divide-border">
              {filteredTargets.map((target) => (
                <li key={target.resourceId}>
                  <button
                    type="button"
                    onClick={() => setActiveTargetId(target.resourceId)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      activeTargetId === target.resourceId && "bg-muted/50",
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {target.displayName}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{target.connectionContext.engine}</span>
                      <span aria-hidden>·</span>
                      <span>{target.connectionContext.environment}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {formatHostPortLabel(
                          target.connectionContext.host,
                          target.connectionContext.port,
                          "—",
                        )}
                      </span>
                    </span>
                    <CredentialStateBadge
                      state={target.governance.credentialState}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel: credential detail */}
      <div className="min-w-0">
        {activeTarget ? (
          <CredentialDetailPanel target={activeTarget} />
        ) : (
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-xl border border-border bg-card">
            <EmptyState
              title={t("detail.noSelection")}
              description=""
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CredentialStateBadge({ state }: { state: string }) {
  const t = useTranslations("queryWorkbench");

  const label = t(`credentialStateValues.${state}`, {
    defaultMessage: state.replaceAll("_", " "),
  });

  const tone =
    state === "configured_readonly_credential"
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
      : state === "secret_missing" || state === "binding_mismatch"
        ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
        : "border-amber-500/30 text-amber-600 dark:text-amber-400";

  return (
    <Badge variant="outline" className={cn("text-xs", tone)}>
      {label}
    </Badge>
  );
}

function CredentialDetailPanel({ target }: { target: QueryTarget }) {
  const t = useTranslations("queryCredentialSettings");
  const tWorkbench = useTranslations("queryWorkbench");
  const [credential, setCredential] =
    useState<QueryCredentialStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [credentialRef, setCredentialRef] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [environmentPolicy, setEnvironmentPolicy] =
    useState<QueryCredentialEnvironmentPolicy>("non_prod_only");
  const [confirmAllEnvironments, setConfirmAllEnvironments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const isConfigured = credential?.configured ?? false;
  const isAllEnvironments = environmentPolicy === "all_environments";
  const canSave =
    credentialRef.trim() !== "" && (!isAllEnvironments || confirmAllEnvironments);

  const loadCredential = useCallback(async (targetId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQueryCredential(targetId);
      setCredential(data);
      setCredentialRef(data.credentialRef);
      setEnabled(data.enabled);
      setEnvironmentPolicy(data.environmentPolicy);
      setConfirmAllEnvironments(false);
    } catch {
      setError("Failed to load credential status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredential(target.resourceId);
  }, [target.resourceId, loadCredential]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const input: QueryCredentialUpsertRequest = {
        credentialRef: credentialRef.trim(),
        enabled,
        environmentPolicy,
      };
      if (isAllEnvironments) {
        input.confirmAllEnvironments = true;
      }
      const result = await saveQueryCredential(target.resourceId, input);
      setCredential(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to save credential",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setRemoving(true);
    setError(null);
    try {
      await deleteQueryCredential(target.resourceId);
      await loadCredential(target.resourceId);
      setShowRemoveConfirm(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to remove credential",
      );
    } finally {
      setRemoving(false);
    }
  }

  const runtimeStatus = credential?.runtimeStatus ?? "missing_metadata";
  const runtimeTone = getRuntimeTone(runtimeStatus);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t("detail.title")}
      </h2>

      {/* Target info */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("detail.targetLabel")}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {target.displayName} · {target.connectionContext.engine} ·{" "}
          {target.connectionContext.environment} ·{" "}
          {formatHostPortLabel(
            target.connectionContext.host,
            target.connectionContext.port,
            tWorkbench("connection.incomplete"),
          )}
        </p>
      </div>

      {/* DBA model guidance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="size-4 text-blue-500" aria-hidden />
            {t("dbaStandardAccount")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("dbaStandardAccountDescription")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link className="size-4 text-purple-500" aria-hidden />
            {t("clusterOverride")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("clusterOverrideDescription")}
          </p>
        </div>
      </div>

      {/* Runtime status */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("detail.runtimeLabel")}…
        </div>
      ) : (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3",
            runtimeTone === "green" &&
              "border-emerald-500/40 bg-emerald-500/10",
            runtimeTone === "amber" &&
              "border-amber-500/40 bg-amber-500/10",
            runtimeTone === "red" && "border-rose-500/40 bg-rose-500/10",
          )}
        >
          {runtimeTone === "green" ? (
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
          ) : runtimeTone === "red" ? (
            <XCircle
              className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400"
              aria-hidden
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
          )}
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                runtimeTone === "green" &&
                  "text-emerald-700 dark:text-emerald-300",
                runtimeTone === "amber" &&
                  "text-amber-700 dark:text-amber-300",
                runtimeTone === "red" &&
                  "text-rose-700 dark:text-rose-300",
              )}
            >
              {t(`runtimeStatus.${runtimeStatus}`)}
            </p>
            {credential?.message && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {credential.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-3">
        {/* Credential reference */}
        <div>
          <label
            htmlFor="credential-ref"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("detail.credentialRefLabel")}
          </label>
          <Input
            id="credential-ref"
            value={credentialRef}
            onChange={(e) => setCredentialRef(e.target.value)}
            placeholder={t("detail.credentialRefPlaceholder")}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("detail.credentialRefHint")}
          </p>
        </div>

        {/* Enabled */}
        <div className="flex items-center gap-2">
          <input
            id="credential-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <label
            htmlFor="credential-enabled"
            className="text-sm text-foreground"
          >
            {t("detail.enabledLabel")}
          </label>
        </div>

        {/* Environment policy */}
        <div>
          <label
            htmlFor="environment-policy"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("detail.environmentPolicyLabel")}
          </label>
          <Select
            value={environmentPolicy}
            onValueChange={(v) => {
              setEnvironmentPolicy(v as QueryCredentialEnvironmentPolicy);
              if (v !== "all_environments") {
                setConfirmAllEnvironments(false);
              }
            }}
          >
            <SelectTrigger
              id="environment-policy"
              className="mt-1"
            >
              <span>{t(`environmentPolicies.${environmentPolicy}`)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_prod_only">
                {t("environmentPolicies.non_prod_only")}
              </SelectItem>
              <SelectItem value="all_environments">
                {t("environmentPolicies.all_environments")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* All-environments confirmation */}
        {isAllEnvironments && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <input
                id="confirm-all-environments"
                type="checkbox"
                checked={confirmAllEnvironments}
                onChange={(e) =>
                  setConfirmAllEnvironments(e.target.checked)
                }
                className="mt-0.5 size-4 rounded border-border"
              />
              <label
                htmlFor="confirm-all-environments"
                className="text-xs leading-relaxed text-amber-800 dark:text-amber-200"
              >
                {t("confirmAllEnvironments.label")}
              </label>
            </div>
            {!confirmAllEnvironments && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("confirmAllEnvironments.required")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Boundary note */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">
          {t("detail.boundaryNote", {
            ref: credentialRef || "{ref}",
          })}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("detail.saving")}
            </>
          ) : (
            <>
              <ExternalLink className="size-3.5" aria-hidden />
              {isConfigured
                ? t("detail.editButton")
                : t("detail.configureButton")}
            </>
          )}
        </Button>

        {isConfigured && !showRemoveConfirm && (
          <Button
            type="button"
            variant="outline"
            disabled={removing}
            onClick={() => setShowRemoveConfirm(true)}
          >
            <Unlink className="size-3.5" aria-hidden />
            {t("detail.removeButton")}
          </Button>
        )}

        {isConfigured && showRemoveConfirm && (
          <>
            <Button
              type="button"
              variant="destructive"
              disabled={removing}
              onClick={handleDelete}
            >
              {removing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("detail.removing")}
                </>
              ) : (
                t("detail.removeConfirmTitle")
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRemoveConfirm(false)}
            >
              {t("detail.removeConfirmDescription").split(".")[0]}
            </Button>
          </>
        )}
      </div>

      {showRemoveConfirm && (
        <p className="text-xs text-muted-foreground">
          {t("detail.removeConfirmDescription")}
        </p>
      )}
    </div>
  );
}

function getRuntimeTone(
  status: QueryCredentialRuntimeStatus,
): "green" | "amber" | "red" {
  switch (status) {
    case "secret_resolved":
      return "green";
    case "missing_metadata":
    case "disabled":
    case "policy_blocked":
    case "secret_missing":
    case "incomplete_connection":
      return "amber";
    case "invalid_ref":
    case "binding_mismatch":
    case "unsupported_target":
      return "red";
    default:
      return "amber";
  }
}
