"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveResource, unarchiveResource } from "@/services/resources";
import type { ResourceListViewModel } from "@/types/view-models";

type ResourceArchiveButtonProps = {
  resource: ResourceListViewModel;
  onArchiveChange?: () => void;
  compact?: boolean;
};

export function ResourceArchiveButton({
  resource,
  onArchiveChange,
  compact = false,
}: ResourceArchiveButtonProps) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const isArchived = resource.isArchived;
  const size = compact ? "xs" : "sm";

  async function handleArchive() {
    setSubmitting(true);
    setError(null);

    try {
      await archiveResource(resource.id, reason.trim() || undefined);
      setConfirming(false);
      setReason("");
      onArchiveChange?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      if (message.includes("404")) {
        setError(t("mutations.errors.notFound"));
      } else {
        setError(t("mutations.errors.backend"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnarchive() {
    setSubmitting(true);
    setError(null);

    try {
      await unarchiveResource(resource.id);
      onArchiveChange?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      if (message.includes("404")) {
        setError(t("mutations.errors.notFound"));
      } else {
        setError(t("mutations.errors.backend"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isArchived) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size={size}
          onClick={handleUnarchive}
          disabled={submitting}
        >
          {submitting
            ? t("mutations.unarchive.submitting")
            : t("common.actions.unarchiveResource")}
        </Button>
        {error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={() => setConfirming(true)}
      >
        {t("common.actions.archiveResource")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm text-muted-foreground">
        {t("mutations.archive.description")}
      </p>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("mutations.archive.reasonPlaceholder")}
        className="h-8 border-border bg-background text-sm"
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex gap-2">
        <Button
          size={size}
          onClick={handleArchive}
          disabled={submitting}
        >
          {submitting
            ? t("mutations.archive.submitting")
            : t("mutations.archive.confirm")}
        </Button>
        <Button
          variant="outline"
          size={size}
          onClick={() => {
            setConfirming(false);
            setReason("");
            setError(null);
          }}
          disabled={submitting}
        >
          {t("common.actions.cancel")}
        </Button>
      </div>
    </div>
  );
}
