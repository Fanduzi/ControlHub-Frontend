"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { Skeleton } from "@/components/ui/skeleton";
import { LabelsEditor } from "@/components/blocks/labels-editor";
import { createResource } from "@/services/resources";
import { ApiError } from "@/services/api-client";
import {
  listEnvironments,
  listHealthStatuses,
  listLifecycleStatuses,
  listOwners,
  listResourceSubtypes,
  listResourceTypes,
} from "@/services/settings";
import { getProfileSchema, hasProfileFields } from "@/lib/profile-field-registry";
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

type FormValues = {
  resourceType: string;
  resourceSubtype?: string;
  name: string;
  displayName: string;
  source: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  externalId?: string;
  labels?: Record<string, string>;
  profile?: Record<string, string | number | boolean>;
};

const STORAGE_KEY = "controlhub_create_resource_prefs";

function loadPrefs(): { environmentId?: string; ownerId?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupt data
  }
  return {};
}

function savePrefs(environmentId: string, ownerId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ environmentId, ownerId }));
  } catch {
    // ignore quota errors
  }
}

function buildFormSchema(profileFields: { key: string; required: boolean; inputType: string }[], requiredMessage: string) {
  const msg = requiredMessage;
  const profileShape: Record<string, z.ZodTypeAny> = {};
  for (const field of profileFields) {
    if (field.inputType === "number") {
      profileShape[field.key] = field.required
        ? z.coerce.number().min(1, msg).max(65535)
        : z.union([z.coerce.number().min(1, msg).max(65535), z.literal("")]).optional().transform(
            (v) => (v === "" ? undefined : v),
          );
    } else {
      profileShape[field.key] = field.required
        ? z.string().min(1, msg)
        : z.string().optional();
    }
  }

  return z.object({
    resourceType: z.string().min(1, msg),
    resourceSubtype: z.string().optional(),
    name: z.string().min(1, msg),
    displayName: z.string().min(1, msg),
    source: z.string(),
    environmentId: z.string().min(1, msg),
    ownerId: z.string().min(1, msg),
    lifecycleStatus: z.string().min(1, msg),
    healthStatus: z.string().min(1, msg),
    externalId: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    profile: z.object(profileShape).optional(),
  });
}

export function CreateResourceSheet({
  open,
  onOpenChange,
}: CreateResourceSheetProps) {
  const t = useTranslations("mutations");
  const ct = useTranslations("common");
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{ id: number } | null>(null);

  const [resourceTypes, setResourceTypes] = useState<ResourceTypeDefinition[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [lifecycleStatuses, setLifecycleStatuses] = useState<DictionaryItem[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<DictionaryItem[]>([]);
  const [resourceSubtypes, setResourceSubtypes] = useState<DictionaryItem[]>([]);
  const [dictsLoaded, setDictsLoaded] = useState(false);
  const [dictError, setDictError] = useState(false);

  const prefs = useMemo(() => loadPrefs(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(buildFormSchema([], ct("fieldRequired"))) as Resolver<FormValues>,
    defaultValues: {
      resourceType: "",
      resourceSubtype: "",
      name: "",
      displayName: "",
      source: "manual",
      environmentId: prefs.environmentId ?? "",
      ownerId: prefs.ownerId ?? "",
      lifecycleStatus: "",
      healthStatus: "",
      externalId: "",
      labels: {},
      profile: {},
    },
  });

  const {
    formState: { isDirty },
  } = form;

  // Unsaved changes guard
  const [pendingClose, setPendingClose] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isDirty && !successState) {
        setPendingClose(true);
        return;
      }
      onOpenChange(nextOpen);
    },
    [isDirty, successState, onOpenChange],
  );

  const handleDiscardConfirm = useCallback(() => {
    setPendingClose(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDiscardCancel = useCallback(() => {
    setPendingClose(false);
  }, []);

  const watchResourceType = form.watch("resourceType");
  const watchResourceSubtype = form.watch("resourceSubtype");

  // Load dictionaries when sheet opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setDictsLoaded(false);
    setDictError(false);

    Promise.all([
      listResourceTypes().catch(() => []),
      listEnvironments().catch(() => []),
      listOwners().catch(() => []),
      listLifecycleStatuses(),
      listHealthStatuses(),
    ]).then(([rt, env, own, lc, hs]) => {
      if (cancelled) return;

      setResourceTypes(rt);
      setEnvironments(env);
      setOwners(own);
      setLifecycleStatuses(lc);
      setHealthStatuses(hs);
      setDictError(rt.length === 0 || env.length === 0 || own.length === 0);
      setDictsLoaded(true);
    });

    // Reset form
    const p = loadPrefs();
    form.reset({
      resourceType: "",
      resourceSubtype: "",
      name: "",
      displayName: "",
      source: "manual",
      environmentId: p.environmentId ?? "",
      ownerId: p.ownerId ?? "",
      lifecycleStatus: "",
      healthStatus: "",
      externalId: "",
      labels: {},
      profile: {},
    });
    setError(null);
    setSuccessState(null);

    return () => { cancelled = true; };
  }, [open, form]);

  // Load subtypes when resource type changes
  useEffect(() => {
    if (!watchResourceType) {
      setResourceSubtypes([]);
      return;
    }

    let cancelled = false;
    listResourceSubtypes(watchResourceType).then((subtypes) => {
      if (!cancelled) setResourceSubtypes(subtypes);
    });
    return () => { cancelled = true; };
  }, [watchResourceType]);

  // Clear subtype when resource type changes
  useEffect(() => {
    form.setValue("resourceSubtype", "");
    form.setValue("profile", {});
  }, [watchResourceType, form]);

  // Auto-fill profile.engine when database_instance subtype is selected
  useEffect(() => {
    if (watchResourceType === "database_instance" && watchResourceSubtype) {
      form.setValue("profile.engine", watchResourceSubtype);
    }
  }, [watchResourceType, watchResourceSubtype, form]);

  const dynamicResolver = useMemo((): Resolver<FormValues> => {
    const schema = getProfileSchema(watchResourceType);
    const fields = schema?.fields ?? [];
    return zodResolver(buildFormSchema(fields, ct("fieldRequired"))) as Resolver<FormValues>;
  }, [watchResourceType, ct]);

  const profileSchema = useMemo(() => {
    if (!watchResourceType) return null;
    return getProfileSchema(watchResourceType) ?? null;
  }, [watchResourceType]);

  const showProfileSection = watchResourceType !== "";

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);

      const currentSchema = getProfileSchema(values.resourceType);
      const numberFields = new Set(
        currentSchema?.fields.filter((f) => f.inputType === "number").map((f) => f.key) ?? [],
      );
      const profileData = Object.fromEntries(
        Object.entries(values.profile ?? {})
          .filter(([, v]) => v !== "" && v !== undefined)
          .map(([k, v]) => [k, numberFields.has(k) ? Number(v) : v]),
      );

      const input: CreateResourceInput = {
        resourceType: values.resourceType,
        name: values.name,
        displayName: values.displayName,
        environmentId: Number(values.environmentId),
        ownerId: Number(values.ownerId),
        lifecycleStatus: values.lifecycleStatus,
        healthStatus: values.healthStatus,
        source: values.source || "manual",
        ...(values.resourceSubtype && { resourceSubtype: values.resourceSubtype }),
        ...(values.externalId && { externalId: values.externalId }),
        ...(values.labels && Object.keys(values.labels).length > 0 && { labels: values.labels }),
        ...(Object.keys(profileData).length > 0 && { profile: profileData }),
      };

      try {
        const created = await createResource(input);
        savePrefs(values.environmentId, values.ownerId);
        setSuccessState({ id: created.id });
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.details) {
          for (const [field, message] of Object.entries(err.details)) {
            const hasProfileKey = field.startsWith("profile.");
            form.setError(
              hasProfileKey ? (field as keyof FormValues) : (field as keyof FormValues),
              { message },
            );
          }
          if (err.details._form) {
            setError(err.details._form);
          }
        } else if (err instanceof ApiError) {
          if (err.status === 409) {
            setError(t("errors.conflict"));
          } else if (err.status === 401) {
            setError(t("errors.unauthorized"));
          } else if (err.status === 400) {
            setError(t("errors.validation"));
          } else {
            setError(err.message || t("errors.backend"));
          }
        } else {
          setError(t("errors.unknown"));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [form, t, router],
  );

  const handleResetAndContinue = useCallback(() => {
    const p = loadPrefs();
    form.reset({
      resourceType: "",
      resourceSubtype: "",
      name: "",
      displayName: "",
      source: "manual",
      environmentId: p.environmentId ?? "",
      ownerId: p.ownerId ?? "",
      lifecycleStatus: "",
      healthStatus: "",
      externalId: "",
      labels: {},
      profile: {},
    });
    setError(null);
    setSuccessState(null);
  }, [form]);

  const handleViewDetails = useCallback(() => {
    if (successState?.id) {
      router.push(`/resources/${successState.id}`);
      handleOpenChange(false);
    }
  }, [successState, router, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto border-l border-border bg-background">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>{t("create.title")}</SheetTitle>
          <SheetDescription>{t("create.description")}</SheetDescription>
        </SheetHeader>

        <form
          className="space-y-6 px-6 py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const values = form.getValues();
            const result = await dynamicResolver(
              values,
              undefined,
              {} as Parameters<Resolver<FormValues>>[2],
            );
            if (result.errors && Object.keys(result.errors).length > 0) {
              for (const [field, err] of Object.entries(result.errors)) {
                const message = (err as { message?: string } | undefined)?.message ?? "Invalid";
                form.setError(field as keyof FormValues, { message });
              }
              return;
            }
            handleSubmit(values);
          }}
        >
          {/* Card A -- Basic Info */}
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("create.sections.identity")}
            </h3>
            <div className="space-y-3">
              {/* Row 1: resourceType + resourceSubtype */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-resourceType" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.resourceType")} *
                  </label>
                  <Select
                    value={watchResourceType}
                    onValueChange={(v) => {
                      if (v !== null) form.setValue("resourceType", v);
                    }}
                  >
                    <SelectTrigger id="create-resourceType" aria-required="true" className="h-9 w-full border-border bg-background">
                      <SelectValue placeholder={ct("fields.resourceType")} />
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
                  <label htmlFor="create-resourceSubtype" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.resourceSubtype")}
                  </label>
                  <Select
                    value={watchResourceSubtype}
                    onValueChange={(v) => {
                      if (v !== null) form.setValue("resourceSubtype", v);
                    }}
                  >
                    <SelectTrigger id="create-resourceSubtype" className="h-9 w-full border-border bg-background">
                      <SelectValue placeholder="--" />
                    </SelectTrigger>
                    <SelectContent>
                      {resourceSubtypes.map((st) => (
                        <SelectItem key={st.key} value={st.key}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: name + displayName */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-name" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.name")} *
                  </label>
                  <Input
                    id="create-name"
                    aria-required="true"
                    {...form.register("name")}
                    className="h-9 border-border bg-background"
                  />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="create-displayName" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.displayName")} *
                  </label>
                  <Input
                    id="create-displayName"
                    aria-required="true"
                    {...form.register("displayName")}
                    className="h-9 border-border bg-background"
                  />
                  {form.formState.errors.displayName && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.displayName.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Source (disabled) */}
              <div>
                <label htmlFor="create-source" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {ct("fields.source")}
                </label>
                <Input
                  id="create-source"
                  value="manual"
                  disabled
                  className="h-9 border-border bg-muted"
                />
              </div>
            </div>
          </section>

          {/* Card B -- Runtime Profile */}
          {showProfileSection && (
            <section key={watchResourceType} className="rounded-xl border border-border p-4">
              <h3 className="mb-1 text-sm font-medium text-foreground">
                {t("profileSection")}
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("profileSectionHint")}
              </p>

              {!hasProfileFields(watchResourceType) ? (
                <p className="text-sm text-muted-foreground">
                  {t("noProfileFields")}
                </p>
              ) : (
                profileSchema && (
                  <div className="space-y-3">
                    {profileSchema.fields.map((field) => {
                      const fieldName = `profile.${field.key}` as const;
                      const fieldError = (
                        form.formState.errors.profile as
                          | Record<string, { message?: string }>
                          | undefined
                      )?.[field.key];

                      return (
                        <div key={field.key}>
                          <label htmlFor={`create-profile-${field.key}`} className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {t(`profileFields.${field.key}`)}
                            {field.required && " *"}
                          </label>
                          {field.inputType === "select" ? (
                            <Select
                              value={(form.watch(fieldName) as string) ?? ""}
                              onValueChange={(v) => {
                                if (v !== null)
                                  form.setValue(fieldName, v);
                              }}
                            >
                              <SelectTrigger id={`create-profile-${field.key}`} aria-required={field.required ? "true" : undefined} className="h-9 w-full border-border bg-background">
                                <SelectValue placeholder={field.placeholder ?? ""} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {t(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`create-profile-${field.key}`}
                              aria-required={field.required ? "true" : undefined}
                              type={field.inputType === "number" ? "number" : "text"}
                              placeholder={field.placeholder ?? ""}
                              {...form.register(fieldName)}
                              className="h-9 border-border bg-background"
                            />
                          )}
                          {fieldError && (
                            <p className="mt-1 text-xs text-destructive">
                              {fieldError.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </section>
          )}

          {/* Card C -- Environment & Properties */}
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("create.sections.ownership")}
            </h3>
            <div className="space-y-3">
              {/* Row 1: environment + owner (with Skeleton) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-environmentId" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.environment")} *
                  </label>
                  {dictsLoaded ? (
                    <Select
                      value={form.watch("environmentId")}
                      onValueChange={(v) => {
                        if (v !== null) form.setValue("environmentId", v);
                      }}
                    >
                      <SelectTrigger id="create-environmentId" aria-required="true" className="h-9 w-full border-border bg-background">
                        <SelectValue placeholder={ct("fields.environment")} />
                      </SelectTrigger>
                      <SelectContent>
                        {environments.map((env) => (
                          <SelectItem key={env.id} value={env.id}>
                            {env.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Skeleton className="h-9 w-full" />
                  )}
                </div>
                <div>
                  <label htmlFor="create-ownerId" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.owner")} *
                  </label>
                  {dictsLoaded ? (
                    <Select
                      value={form.watch("ownerId")}
                      onValueChange={(v) => {
                        if (v !== null) form.setValue("ownerId", v);
                      }}
                    >
                      <SelectTrigger id="create-ownerId" aria-required="true" className="h-9 w-full border-border bg-background">
                        <SelectValue placeholder={ct("fields.owner")} />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((own) => (
                          <SelectItem key={own.id} value={own.id}>
                            {own.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Skeleton className="h-9 w-full" />
                  )}
                </div>
              </div>

              {/* Row 2: lifecycleStatus + healthStatus */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-lifecycleStatus" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.lifecycleStatus")} *
                  </label>
                  <Select
                    value={form.watch("lifecycleStatus")}
                    onValueChange={(v) => {
                      if (v !== null) form.setValue("lifecycleStatus", v);
                    }}
                  >
                    <SelectTrigger id="create-lifecycleStatus" aria-required="true" className="h-9 w-full border-border bg-background">
                      <SelectValue placeholder={ct("fields.lifecycleStatus")} />
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
                  <label htmlFor="create-healthStatus" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {ct("fields.healthStatus")} *
                  </label>
                  <Select
                    value={form.watch("healthStatus")}
                    onValueChange={(v) => {
                      if (v !== null) form.setValue("healthStatus", v);
                    }}
                  >
                    <SelectTrigger id="create-healthStatus" aria-required="true" className="h-9 w-full border-border bg-background">
                      <SelectValue placeholder={ct("fields.healthStatus")} />
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

              {/* externalId */}
              <div>
                <label htmlFor="create-externalId" className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {ct("fields.externalId")}
                </label>
                <Input
                  id="create-externalId"
                  {...form.register("externalId")}
                  className="h-9 border-border bg-background"
                />
              </div>

              {/* labels */}
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {ct("fields.labels")}
                </label>
                <LabelsEditor
                  value={form.watch("labels") ?? {}}
                  onChange={(labels) => form.setValue("labels", labels)}
                />
              </div>
            </div>
          </section>

          {/* Error banner */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Success state */}
          {successState && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
              <p>{t("createdSuccess")}</p>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetAndContinue}
                >
                  {t("continueCreate")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleViewDetails}
                >
                  {t("viewDetails")}
                </Button>
              </div>
            </div>
          )}

          {/* Dictionary loading error */}
          {dictError && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
              {t("errors.capabilityUnavailable")}
            </div>
          )}

          {/* Submit buttons */}
          {!successState && (
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                {ct("actions.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || dictError}
              >
                {submitting ? t("create.submitting") : ct("actions.save")}
              </Button>
            </div>
          )}
        </form>
      </SheetContent>
      <AlertDialog open={pendingClose} onOpenChange={(o) => { if (!o) handleDiscardCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ct("unsavedChanges.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {ct("unsavedChanges.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ct("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardConfirm}>
              {ct("unsavedChanges.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
