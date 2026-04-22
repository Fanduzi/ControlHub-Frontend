"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { Skeleton } from "@/components/ui/skeleton";
import { LabelsEditor } from "@/components/blocks/labels-editor";
import { getProfileSchema, hasProfileFields } from "@/lib/profile-field-registry";
import {
  getResourceProfileById,
  updateProfile,
  updateResource,
} from "@/services/resources";
import {
  listEnvironments,
  listHealthStatuses,
  listLifecycleStatuses,
  listOwners,
  listResourceSubtypes,
} from "@/services/settings";
import { ApiError } from "@/services/api-client";
import type { UpdateResourceInput } from "@/types/resource";
import type { DictionaryItem, Environment, Owner } from "@/types/settings";
import type { ResourceDetailViewModel } from "@/types/view-models";

type EditResourceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceDetailViewModel | null;
};

const editFormSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  resourceSubtype: z.string(),
  environmentId: z.string().min(1),
  ownerId: z.string().min(1),
  lifecycleStatus: z.string().min(1),
  healthStatus: z.string().min(1),
  externalId: z.string(),
  labels: z.record(z.string(), z.string()),
  profile: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.undefined()])),
});

type EditFormValues = z.infer<typeof editFormSchema>;

export function EditResourceSheet({
  open,
  onOpenChange,
  resource,
}: EditResourceSheetProps) {
  const t = useTranslations();
  const router = useRouter();

  const {
    register,
    reset,
    setValue,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
    setError: setFormError,
    clearErrors,
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: "",
      displayName: "",
      resourceSubtype: "",
      environmentId: "",
      ownerId: "",
      lifecycleStatus: "",
      healthStatus: "",
      externalId: "",
      labels: {},
      profile: {},
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [lifecycleStatuses, setLifecycleStatuses] = useState<DictionaryItem[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<DictionaryItem[]>([]);
  const [subtypes, setSubtypes] = useState<DictionaryItem[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [currentProfileData, setCurrentProfileData] = useState<Record<string, string | number | boolean | null>>({});

  // Load data when sheet opens or resource changes
  useEffect(() => {
    if (!open || !resource) return;

    setError(null);
    setProfileError(null);
    setBaseError(null);

    const profileSchema = getProfileSchema(resource.resourceType);
    const profileDefaults: Record<string, string | number | boolean | undefined> = {};

    // Load profile data in parallel with dropdown options
    setOptionsLoading(true);

    Promise.all([
      listEnvironments().catch(() => []),
      listOwners().catch(() => []),
      listLifecycleStatuses(),
      listHealthStatuses(),
      listResourceSubtypes(resource.resourceType),
      hasProfileFields(resource.resourceType)
        ? getResourceProfileById(resource.id).catch(() => null)
        : Promise.resolve(null),
    ]).then(([env, own, lc, hs, sub, profileResp]) => {
      setEnvironments(env);
      setOwners(own);
      setLifecycleStatuses(lc);
      setHealthStatuses(hs);
      setSubtypes(sub);
      setOptionsLoading(false);

      if (profileResp?.profile) {
        setCurrentProfileData(profileResp.profile as Record<string, string | number | boolean | null>);
        for (const field of profileSchema?.fields ?? []) {
          const raw = profileResp.profile[field.key];
          profileDefaults[field.key] = raw != null ? String(raw) : "";
        }
      } else {
        setCurrentProfileData({});
      }

      reset({
        name: resource.name,
        displayName: resource.displayName,
        resourceSubtype: resource.resourceSubtype ?? "",
        environmentId: resource.environmentId,
        ownerId: resource.ownerId,
        lifecycleStatus: resource.lifecycleStatus,
        healthStatus: resource.healthStatus,
        externalId: resource.externalId ?? "",
        labels: resource.labels ?? {},
        profile: profileDefaults,
      });
    });
  }, [open, resource, reset]);

  // Handle close with unsaved changes check
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isDirty) {
        const confirmed = window.confirm(
          "You have unsaved changes. Discard?",
        );
        if (!confirmed) return;
      }
      onOpenChange(nextOpen);
    },
    [isDirty, onOpenChange],
  );

  const onSubmit = useCallback(
    async (data: EditFormValues) => {
      if (!resource) return;

      setSubmitting(true);
      setError(null);
      setBaseError(null);
      setProfileError(null);

      // Determine which base fields changed
      const baseFieldKeys = [
        "name",
        "displayName",
        "resourceSubtype",
        "environmentId",
        "ownerId",
        "lifecycleStatus",
        "healthStatus",
        "externalId",
      ] as const;

      type BaseFieldKey = (typeof baseFieldKeys)[number];

      const changedBaseFields: Partial<Record<BaseFieldKey, string>> = {};
      for (const key of baseFieldKeys) {
        if (dirtyFields[key]) {
          changedBaseFields[key] = data[key] as string;
        }
      }

      // Determine changed profile fields
      const changedProfileFields: Record<string, string | number | boolean> = {};
      if (dirtyFields.profile && data.profile) {
        for (const key of Object.keys(dirtyFields.profile)) {
          if (dirtyFields.profile[key]) {
            const val = data.profile[key];
            if (val !== undefined) {
              changedProfileFields[key] = val;
            }
          }
        }
      }

      const labelsDirty = !!dirtyFields.labels;
      const hasBaseChanges = Object.keys(changedBaseFields).length > 0 || labelsDirty;
      const hasProfileChanges = Object.keys(changedProfileFields).length > 0;

      if (!hasBaseChanges && !hasProfileChanges) {
        setSubmitting(false);
        onOpenChange(false);
        return;
      }

      // Build promises for parallel execution
      const promises: Promise<unknown>[] = [];
      const promiseLabels: ("base" | "profile")[] = [];

      if (hasBaseChanges) {
        const input: UpdateResourceInput = { ...changedBaseFields };
        if (labelsDirty) {
          input.labels = data.labels;
        }
        promises.push(updateResource(resource.id, input));
        promiseLabels.push("base");
      }

      if (hasProfileChanges) {
        promises.push(updateProfile(resource.id, changedProfileFields));
        promiseLabels.push("profile");
      }

      const results = await Promise.allSettled(promises);

      let hasAnyError = false;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const label = promiseLabels[i];

        if (result.status === "rejected") {
          hasAnyError = true;
          const err = result.reason;

          if (err instanceof ApiError) {
            if (err.details) {
              // Map field-level errors
              for (const [field, message] of Object.entries(err.details)) {
                if (label === "profile") {
                  setFormError(`profile.${field}` as keyof EditFormValues, {
                    message,
                  });
                } else {
                  setFormError(field as keyof EditFormValues, { message });
                }
              }
            }

            const errorMessage = err.message;
            if (label === "base") {
              if (err.status === 401) {
                setBaseError(t("mutations.errors.unauthorized"));
              } else if (err.status === 404) {
                setBaseError(t("mutations.errors.notFound"));
              } else if (err.status === 400) {
                setBaseError(t("mutations.errors.validation"));
              } else {
                setBaseError(errorMessage || t("mutations.errors.backend"));
              }
            } else {
              if (err.status === 401) {
                setProfileError(t("mutations.errors.unauthorized"));
              } else if (err.status === 404) {
                setProfileError(t("mutations.errors.notFound"));
              } else if (err.status === 400) {
                setProfileError(t("mutations.errors.validation"));
              } else {
                setProfileError(errorMessage || t("mutations.errors.backend"));
              }
            }
          } else if (err instanceof Error) {
            if (label === "base") {
              setBaseError(t("mutations.errors.backend"));
            } else {
              setProfileError(t("mutations.errors.backend"));
            }
          } else {
            if (label === "base") {
              setBaseError(t("mutations.errors.unknown"));
            } else {
              setProfileError(t("mutations.errors.unknown"));
            }
          }
        }
      }

      setSubmitting(false);

      if (!hasAnyError) {
        router.refresh();
        onOpenChange(false);
      }
    },
    [resource, dirtyFields, router, onOpenChange, t, setFormError],
  );

  const profileSchema = resource ? getProfileSchema(resource.resourceType) : undefined;

  // Friendly resource type name
  const resourceTypeDisplay = resource
    ? (t.has(`dictionaryValues.${resource.resourceType}`)
        ? t(`dictionaryValues.${resource.resourceType}`)
        : resource.resourceType)
    : "";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto border-l border-border bg-background">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>{t("mutations.edit.title")}</SheetTitle>
          <SheetDescription>
            {t("mutations.edit.description")}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 px-6 py-5"
        >
          {/* Card A — Basic Info */}
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.identity")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.name")}
                </label>
                <Input
                  {...register("name")}
                  className="h-9 border-border bg-background"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mutations.nameEditable")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.displayName")}
                </label>
                <Input
                  {...register("displayName")}
                  className="h-9 border-border bg-background"
                />
                {errors.displayName && (
                  <p className="mt-1 text-xs text-destructive">{errors.displayName.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.resourceType")}
                </label>
                <Input
                  value={resourceTypeDisplay}
                  disabled
                  className="h-9 border-border bg-muted text-muted-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mutations.edit.immutable")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.resourceSubtype")}
                </label>
                {optionsLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    defaultValue={resource?.resourceSubtype ?? ""}
                    onValueChange={(v) => {
                      if (v !== null) {
                        setValue("resourceSubtype", v, { shouldDirty: true });
                        clearErrors("resourceSubtype");
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-full border-border bg-background">
                      <SelectValue placeholder={t("common.fields.resourceSubtype")} />
                    </SelectTrigger>
                    <SelectContent>
                      {subtypes.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </section>

          {/* Card B — Runtime Profile */}
          {resource && (
            <section
              key={resource.resourceType}
              className="rounded-xl border border-border p-4"
            >
              <h3 className="mb-1 text-sm font-medium text-foreground">
                {t("mutations.profileSection")}
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("mutations.profileSectionHint")}
              </p>

              {!profileSchema || profileSchema.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("mutations.noProfileFields")}
                </p>
              ) : (
                <div className="space-y-3">
                  {profileSchema.fields.map((field) => {
                    const rawValue = currentProfileData[field.key];
                    const defaultVal = rawValue != null ? String(rawValue) : "";

                    return (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {t(field.labelKey)}
                          {field.required && " *"}
                        </label>
                        {field.inputType === "select" && field.options ? (
                          <Select
                            defaultValue={defaultVal}
                            onValueChange={(v) => {
                              if (v !== null) {
                                setValue(`profile.${field.key}` as const, v, {
                                  shouldDirty: true,
                                });
                                clearErrors(`profile.${field.key}` as const);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 w-full border-border bg-background">
                              <SelectValue placeholder={field.placeholder ?? ""} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelKey)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={field.inputType === "number" ? "number" : "text"}
                            defaultValue={defaultVal}
                            placeholder={field.placeholder ?? ""}
                            {...register(`profile.${field.key}` as const)}
                            className="h-9 border-border bg-background"
                          />
                        )}
                        {errors.profile?.[field.key] && (
                          <p className="mt-1 text-xs text-destructive">
                            {errors.profile[field.key]?.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {profileError && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {profileError}
                </div>
              )}
            </section>
          )}

          {/* Card C — Environment & Attributes */}
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("mutations.create.sections.ownership")}
            </h3>
            <div className="space-y-3">
              {/* Row 1: Environment + Owner */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t("common.fields.environment")}
                  </label>
                  {optionsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      defaultValue={resource?.environmentId ?? ""}
                      onValueChange={(v) => {
                        if (v !== null) {
                          setValue("environmentId", v, { shouldDirty: true });
                          clearErrors("environmentId");
                        }
                      }}
                    >
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
                  )}
                  {errors.environmentId && (
                    <p className="mt-1 text-xs text-destructive">{errors.environmentId.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t("common.fields.owner")}
                  </label>
                  {optionsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      defaultValue={resource?.ownerId ?? ""}
                      onValueChange={(v) => {
                        if (v !== null) {
                          setValue("ownerId", v, { shouldDirty: true });
                          clearErrors("ownerId");
                        }
                      }}
                    >
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
                  )}
                  {errors.ownerId && (
                    <p className="mt-1 text-xs text-destructive">{errors.ownerId.message}</p>
                  )}
                </div>
              </div>

              {/* Row 2: Lifecycle + Health */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t("common.fields.lifecycleStatus")}
                  </label>
                  <Select
                    defaultValue={resource?.lifecycleStatus ?? ""}
                    onValueChange={(v) => {
                      if (v !== null) {
                        setValue("lifecycleStatus", v, { shouldDirty: true });
                        clearErrors("lifecycleStatus");
                      }
                    }}
                  >
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
                  {errors.lifecycleStatus && (
                    <p className="mt-1 text-xs text-destructive">{errors.lifecycleStatus.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t("common.fields.healthStatus")}
                  </label>
                  <Select
                    defaultValue={resource?.healthStatus ?? ""}
                    onValueChange={(v) => {
                      if (v !== null) {
                        setValue("healthStatus", v, { shouldDirty: true });
                        clearErrors("healthStatus");
                      }
                    }}
                  >
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
                  {errors.healthStatus && (
                    <p className="mt-1 text-xs text-destructive">{errors.healthStatus.message}</p>
                  )}
                </div>
              </div>

              {/* External ID */}
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.externalId")}
                </label>
                <Input
                  {...register("externalId")}
                  className="h-9 border-border bg-background"
                />
              </div>

              {/* Labels */}
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.labels")}
                </label>
                <LabelsEditor
                  value={(resource?.labels ?? {})}
                  onChange={(labels) => {
                    setValue("labels", labels, { shouldDirty: true });
                  }}
                />
              </div>
            </div>
          </section>

          {/* Error banners */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {baseError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {baseError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting
                ? t("mutations.edit.submitting")
                : t("common.actions.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
