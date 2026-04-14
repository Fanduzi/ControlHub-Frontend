"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { updateResource } from "@/services/resources";
import {
  listEnvironments,
  listHealthStatuses,
  listLifecycleStatuses,
  listOwners,
} from "@/services/settings";
import type { UpdateResourceInput } from "@/types/resource";
import type { DictionaryItem, Environment, Owner } from "@/types/settings";
import type { ResourceDetailViewModel } from "@/types/view-models";

type EditResourceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceDetailViewModel | null;
};

export function EditResourceSheet({
  open,
  onOpenChange,
  resource,
}: EditResourceSheetProps) {
  const t = useTranslations();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState("");
  const [healthStatus, setHealthStatus] = useState("");
  const [source, setSource] = useState("");
  const [externalId, setExternalId] = useState("");
  const [labels, setLabels] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [lifecycleStatuses, setLifecycleStatuses] = useState<DictionaryItem[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<DictionaryItem[]>([]);

  useEffect(() => {
    if (!open || !resource) return;

    setDisplayName(resource.displayName);
    setEnvironmentId(resource.environmentId);
    setOwnerId(resource.ownerId);
    setLifecycleStatus(resource.lifecycleStatus);
    setHealthStatus(resource.healthStatus);
    setSource(resource.source);
    setExternalId(resource.externalId);
    setLabels(
      resource.labels && Object.keys(resource.labels).length > 0
        ? JSON.stringify(resource.labels, null, 2)
        : "",
    );
    setError(null);

    Promise.all([
      listEnvironments().catch(() => []),
      listOwners().catch(() => []),
      listLifecycleStatuses(),
      listHealthStatuses(),
    ]).then(([env, own, lc, hs]) => {
      setEnvironments(env);
      setOwners(own);
      setLifecycleStatuses(lc);
      setHealthStatuses(hs);
    });
  }, [open, resource]);

  const handleSubmit = useCallback(async () => {
    if (!resource) return;

    setSubmitting(true);
    setError(null);

    let parsedLabels: Record<string, string> | undefined;
    if (labels.trim()) {
      try {
        parsedLabels = JSON.parse(labels);
      } catch {
        setError(t("mutations.errors.validation"));
        setSubmitting(false);
        return;
      }
    }

    const input: UpdateResourceInput = {
      displayName,
      environmentId,
      ownerId,
      lifecycleStatus,
      healthStatus,
      source: source || "manual",
      externalId,
      ...(parsedLabels !== undefined ? { labels: parsedLabels } : {}),
    };

    try {
      await updateResource(resource.id, input);
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("401")) {
          setError(t("mutations.errors.unauthorized"));
        } else if (msg.includes("404")) {
          setError(t("mutations.errors.notFound"));
        } else if (msg.includes("400")) {
          setError(t("mutations.errors.validation"));
        } else {
          setError(t("mutations.errors.backend"));
        }
      } else {
        setError(t("mutations.errors.unknown"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    resource,
    displayName,
    environmentId,
    ownerId,
    lifecycleStatus,
    healthStatus,
    source,
    externalId,
    labels,
    t,
    router,
    onOpenChange,
  ]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto border-l border-border bg-background">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>{t("mutations.edit.title")}</SheetTitle>
          <SheetDescription>
            {t("mutations.edit.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.name")}
            </label>
            <Input
              value={resource?.name ?? ""}
              disabled
              className="h-9 border-border bg-muted text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("mutations.edit.immutable")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.resourceType")}
            </label>
            <Input
              value={resource?.resourceType ?? ""}
              disabled
              className="h-9 border-border bg-muted text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("mutations.edit.immutable")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.displayName")}
            </label>
            <Input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setError(null);
              }}
              className="h-9 border-border bg-background"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.environment")}
            </label>
            <Select value={environmentId} onValueChange={(v) => { if (v !== null) setEnvironmentId(v); }}>
              <SelectTrigger className="h-9 w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.owner")}
            </label>
            <Select value={ownerId} onValueChange={(v) => { if (v !== null) setOwnerId(v); }}>
              <SelectTrigger className="h-9 w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {owners.map((own) => (
                  <SelectItem key={own.id} value={own.id}>
                    {own.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.lifecycleStatus")}
            </label>
            <Select value={lifecycleStatus} onValueChange={(v) => { if (v !== null) setLifecycleStatus(v); }}>
              <SelectTrigger className="h-9 w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lifecycleStatuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.healthStatus")}
            </label>
            <Select value={healthStatus} onValueChange={(v) => { if (v !== null) setHealthStatus(v); }}>
              <SelectTrigger className="h-9 w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {healthStatuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.externalId")}
            </label>
            <Input
              value={externalId}
              onChange={(e) => {
                setExternalId(e.target.value);
                setError(null);
              }}
              className="h-9 border-border bg-background"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("common.fields.labels")}
            </label>
            <Textarea
              value={labels}
              onChange={(e) => {
                setLabels(e.target.value);
                setError(null);
              }}
              placeholder='{"team": "order"}'
              className="min-h-[80px] border-border bg-background font-mono text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? t("mutations.edit.submitting")
                : t("common.actions.save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
