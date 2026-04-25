"use client";

import { useId, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface LabelsEditorProps {
  value: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}

function getValidationErrors(entries: [string, string][], t: (key: string) => string): Map<string, string> {
  const errors = new Map<string, string>();
  const keyCounts = new Map<string, number>();

  for (const [key] of entries) {
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  for (const [key] of entries) {
    if (key === "") {
      errors.set(key, t("errorEmptyKey"));
    } else if ((keyCounts.get(key) ?? 0) > 1) {
      errors.set(key, t("errorDuplicateKey"));
    }
  }

  return errors;
}

export function LabelsEditor({ value, onChange }: LabelsEditorProps) {
  const t = useTranslations("common.labelsEditor");
  const uid = useId();
  const entries = Object.entries(value);
  const errors = useMemo(() => getValidationErrors(entries, t), [entries, t]);

  function updateEntry(index: number, field: "key" | "value", newValue: string) {
    const updated = [...entries];
    if (field === "key") {
      updated[index] = [newValue, updated[index][1]];
    } else {
      updated[index] = [updated[index][0], newValue];
    }
    onChange(Object.fromEntries(updated));
  }

  function removeEntry(index: number) {
    const updated = entries.filter((_, i) => i !== index);
    onChange(Object.fromEntries(updated));
  }

  function addEntry() {
    const existingKeys = new Set(Object.keys(value));
    let newKey = "key";
    let suffix = 1;
    while (existingKeys.has(newKey)) {
      newKey = `key${suffix}`;
      suffix++;
    }
    onChange({ ...value, [newKey]: "" });
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val], index) => {
        const error = errors.get(key);
        const stableKey = `${uid}-${key || `empty-${index}`}`;
        return (
          <div key={stableKey} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={key}
                onChange={(e) => updateEntry(index, "key", e.target.value)}
                placeholder={t("keyPlaceholder")}
                aria-label={t("keyAriaLabel", { number: index + 1 })}
                aria-invalid={!!error}
                className={cn(
                  "h-8 border-border bg-background text-sm",
                  error && "border-destructive focus-visible:ring-destructive/30",
                )}
              />
              {error && (
                <p className="mt-0.5 text-[10px] text-destructive">{error}</p>
              )}
            </div>
            <Input
              value={val}
              onChange={(e) => updateEntry(index, "value", e.target.value)}
              placeholder={t("valuePlaceholder")}
              aria-label={t("valueAriaLabel", { number: index + 1 })}
              className="h-8 border-border bg-background text-sm"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeEntry(index)}
              aria-label={t("removeLabel")}
            >
              <Trash2 className="size-3 text-muted-foreground" />
            </Button>
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-xs"
        onClick={addEntry}
      >
        <Plus className="size-3" /> {t("addLabel")}
      </Button>
    </div>
  );
}
