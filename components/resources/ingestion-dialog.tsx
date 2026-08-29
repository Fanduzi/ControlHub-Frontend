// input: React, next-intl, and ingestion service
// output: localized ingestion review dialog
// pos: resource ingestion review UI
// note: update this header and README.md.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/services/api-client";
import { confirmIngestion, getIngestionPreview, previewIngestion, type IngestionFormat, type IngestionPreview, type IngestionRelation, type IngestionValueDiff } from "@/services/resources";

type IngestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return typeof value === "string" ? value : JSON.stringify(value) ?? "—";
}

function DiffList({ title, values }: { title: string; values: Record<string, IngestionValueDiff> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;
  return <div><p className="font-medium">{title}</p><ul className="ml-4 list-disc text-muted-foreground">{entries.map(([field, value]) => <li key={field}>{field}: {displayValue(value.before)} → {displayValue(value.after)}</li>)}</ul></div>;
}

function RelationList({ title, relations }: { title: string; relations: IngestionRelation[] }) {
  if (relations.length === 0) return null;
  return <div><p className="font-medium">{title}</p><ul className="ml-4 list-disc text-muted-foreground">{relations.map((relation) => <li key={`${relation.type}-${relation.targetId}`}>{relation.type} → #{relation.targetId}</li>)}</ul></div>;
}

function summary(preview: IngestionPreview, translate: ReturnType<typeof useTranslations>): string {
  const counts = preview.rows.reduce((total, row) => ({ ...total, [row.action]: total[row.action] + 1 }), { create: 0, update: 0, conflict: 0 });
  return translate("summary", { created: counts.create, updated: counts.update, conflicts: counts.conflict });
}

export function IngestionDialog({ open, onOpenChange }: IngestionDialogProps) {
  const t = useTranslations("mutations.ingestion");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<IngestionFormat>("json");
  const [preview, setPreview] = useState<IngestionPreview | null>(null);
  const [result, setResult] = useState<IngestionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resetReview = () => { setPreview(null); setResult(null); setError(null); };

  const handlePreview = async () => {
    if (!file) { setError(t("fileRequired")); return; }
    setSubmitting(true); setError(null); setResult(null);
    try { setPreview(await previewIngestion(file, format)); }
    catch (caught) { setPreview(null); setError(caught instanceof ApiError && (caught.status === 400 || caught.status === 413) ? t("invalid") : t("error")); }
    finally { setSubmitting(false); }
  };
  const handleConfirm = async () => {
    if (!file || !preview?.confirmable) return;
    setSubmitting(true); setError(null);
    try { const confirmed = await confirmIngestion(file, format, preview.fingerprint); setPreview(null); setResult(confirmed); router.refresh(); }
    catch (caught) {
      const freshPreview = getIngestionPreview(caught);
      if (freshPreview) { setPreview(freshPreview); setError(t("reviewRequired")); }
      else { setPreview(null); setError(caught instanceof ApiError && caught.status === 409 ? t("stale") : t("error")); }
    }
    finally { setSubmitting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription>{t("description")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="grid gap-1 font-medium">{t("file")}<input aria-label={t("file")} type="file" accept=".csv,text/csv,.json,application/json" onChange={(event) => { setFile(event.target.files?.[0] ?? null); resetReview(); }} /></label><label className="grid gap-1 font-medium">{t("format")}<select aria-label={t("format")} value={format} onChange={(event) => { setFormat(event.target.value as IngestionFormat); resetReview(); }} className="h-9 rounded-md border border-input bg-background px-2"><option value="json">JSON</option><option value="csv">CSV</option></select></label></div>{error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</p>}{preview && <section aria-label={t("previewTitle")} className="grid gap-3"><p className="font-medium">{summary(preview, t)}</p>{!preview.confirmable && <p role="alert" className="text-destructive">{t("conflictsBlock")}</p>}{preview.rows.map((row) => <article key={row.row} className="grid gap-2 rounded-md border p-3"><div className="flex gap-2"><strong>{t(row.action)}</strong><span>{t("row", { row: row.row })}</span>{row.matchedId && <span>#{row.matchedId}</span>}</div>{row.conflict && <p role="alert" className="text-destructive">{row.conflict}</p>}<DiffList title={t("fields")} values={row.diff.fields} /><DiffList title={t("profile")} values={row.diff.profile} /><DiffList title={t("observed")} values={row.diff.observed} /><RelationList title={t("relationsAdded")} relations={row.diff.relations.added} /><RelationList title={t("relationsRemoved")} relations={row.diff.relations.removed} /></article>)}</section>}{result && <p role="status" className="rounded-md border border-primary/30 bg-primary/10 p-3">{t("success")}<br />{summary(result, t)}</p>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("close")}</Button><Button onClick={handlePreview} disabled={!file || submitting}>{submitting ? t("working") : t("preview")}</Button>{preview && <Button onClick={handleConfirm} disabled={!preview.confirmable || submitting}>{submitting ? t("working") : t("confirm")}</Button>}</DialogFooter></DialogContent></Dialog>;
}
