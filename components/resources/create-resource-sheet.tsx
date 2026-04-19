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
import { LabelsEditor } from "@/components/blocks/labels-editor";
import { createResource } from "@/services/resources";
import {
  listEnvironments,
  listHealthStatuses,
  listLifecycleStatuses,
  listOwners,
  listResourceTypes,
} from "@/services/settings";
import type { CreateResourceInput } from "@/types/resource";
import type {
  DictionaryItem,
  Environment,
  Owner,
  ResourceTypeDefinition,
} from "@/types/settings";

type CreateResourceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormState = {
  resourceType: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  resourceSubtype: string;
  externalId: string;
  labels: Record<string, string>;
};

const INITIAL_STATE: FormState = {
  resourceType: "",
  name: "",
  displayName: "",
  environmentId: "",
  ownerId: "",
  lifecycleStatus: "",
  healthStatus: "",
  source: "manual",
  resourceSubtype: "",
  externalId: "",
  labels: {},
};

export function CreateResourceSheet({
  open,
  onOpenChange,
}: CreateResourceSheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [resourceTypes, setResourceTypes] = useState<ResourceTypeDefinition[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [lifecycleStatuses, setLifecycleStatuses] = useState<DictionaryItem[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<DictionaryItem[]>([]);
  const [dictError, setDictError] = useState(false);

  useEffect(() => {
    if (!open) return;

    Promise.all([
      listResourceTypes().catch(() => []),
      listEnvironments().catch(() => []),
      listOwners().catch(() => []),
      listLifecycleStatuses(),
      listHealthStatuses(),
    ]).then(([rt, env, own, lc, hs]) => {
      setResourceTypes(rt);
      setEnvironments(env);
      setOwners(own);
      setLifecycleStatuses(lc);
      setHealthStatuses(hs);
      setDictError(rt.length === 0 || env.length === 0 || own.length === 0);
    });

    setForm(INITIAL_STATE);
    setError(null);
    setSuccess(false);
  }, [open]);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setError(null);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (
      !form.resourceType ||
      !form.name ||
      !form.displayName ||
      !form.environmentId ||
      !form.ownerId ||
      !form.lifecycleStatus ||
      !form.healthStatus
    ) {
      setError(t("mutations.errors.validation"));
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateResourceInput = {
      resourceType: form.resourceType,
      name: form.name,
      displayName: form.displayName,
      environmentId: form.environmentId,
      ownerId: form.ownerId,
      lifecycleStatus: form.lifecycleStatus,
      healthStatus: form.healthStatus,
      source: form.source || "manual",
      ...(form.resourceSubtype && { resourceSubtype: form.resourceSubtype }),
      ...(form.externalId && { externalId: form.externalId }),
      ...(Object.keys(form.labels).length > 0 && { labels: form.labels }),
    };

    try {
      await createResource(input);
      setSuccess(true);
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("409")) {
          setError(t("mutations.errors.conflict"));
        } else if (msg.includes("401")) {
          setError(t("mutations.errors.unauthorized"));
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
  }, [form, t, router, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto border-l border-border bg-background">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>{t("mutations.create.title")}</SheetTitle>
          <SheetDescription>{t("mutations.create.description")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.identity")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.resourceType")} *
                </label>
                <Select
                  value={form.resourceType}
                  onValueChange={(v) => { if (v !== null) updateField("resourceType", v); }}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-background">
                    <SelectValue placeholder={t("common.fields.resourceType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {resourceTypes.map((rt) => (
                      <SelectItem key={rt.key} value={rt.key}>
                        {rt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.name")} *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="h-9 border-border bg-background"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.displayName")} *
                </label>
                <Input
                  value={form.displayName}
                  onChange={(e) => updateField("displayName", e.target.value)}
                  className="h-9 border-border bg-background"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.resourceSubtype")}
                </label>
                <Input
                  value={form.resourceSubtype}
                  onChange={(e) => updateField("resourceSubtype", e.target.value)}
                  className="h-9 border-border bg-background"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.ownership")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.environment")} *
                </label>
                <Select
                  value={form.environmentId}
                  onValueChange={(v) => { if (v !== null) updateField("environmentId", v); }}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-background">
                    <SelectValue placeholder={t("common.fields.environment")} />
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
                  {t("common.fields.owner")} *
                </label>
                <Select
                  value={form.ownerId}
                  onValueChange={(v) => { if (v !== null) updateField("ownerId", v); }}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-background">
                    <SelectValue placeholder={t("common.fields.owner")} />
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
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.status")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.lifecycleStatus")} *
                </label>
                <Select
                  value={form.lifecycleStatus}
                  onValueChange={(v) => { if (v !== null) updateField("lifecycleStatus", v); }}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-background">
                    <SelectValue placeholder={t("common.fields.lifecycleStatus")} />
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
                  {t("common.fields.healthStatus")} *
                </label>
                <Select
                  value={form.healthStatus}
                  onValueChange={(v) => { if (v !== null) updateField("healthStatus", v); }}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-background">
                    <SelectValue placeholder={t("common.fields.healthStatus")} />
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
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.labels")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.externalId")}
                </label>
                <Input
                  value={form.externalId}
                  onChange={(e) => updateField("externalId", e.target.value)}
                  className="h-9 border-border bg-background"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.labels")}
                </label>
                <LabelsEditor
                  value={form.labels}
                  onChange={(labels) => updateField("labels", labels)}
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
              {t("mutations.create.success")}
            </div>
          )}
          {dictError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
              {t("mutations.errors.capabilityUnavailable")}
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
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || dictError}
            >
              {submitting
                ? t("mutations.create.submitting")
                : t("common.actions.save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
