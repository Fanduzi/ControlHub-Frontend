"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface LabelsEditorProps {
  value: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}

function getValidationErrors(entries: [string, string][]): Map<number, string> {
  const errors = new Map<number, string>();
  const keyCounts = new Map<string, number>();

  for (const [key] of entries) {
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    if (key === "") {
      errors.set(i, "Key cannot be empty");
    } else if ((keyCounts.get(key) ?? 0) > 1) {
      errors.set(i, "Duplicate key");
    }
  }

  return errors;
}

export function LabelsEditor({ value, onChange }: LabelsEditorProps) {
  const entries = Object.entries(value);
  const errors = getValidationErrors(entries);

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
        const error = errors.get(index);
        return (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={key}
                onChange={(e) => updateEntry(index, "key", e.target.value)}
                placeholder="Key"
                aria-label={`Label key ${index + 1}`}
                aria-invalid={!!error}
                className={cn(
                  "h-8 border-border bg-background text-sm",
                  error && "border-red-500 focus-visible:ring-red-500/30",
                )}
              />
              {error && (
                <p className="mt-0.5 text-[10px] text-red-500">{error}</p>
              )}
            </div>
            <Input
              value={val}
              onChange={(e) => updateEntry(index, "value", e.target.value)}
              placeholder="Value"
              aria-label={`Label value ${index + 1}`}
              className="h-8 border-border bg-background text-sm"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeEntry(index)}
              aria-label="Remove label"
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
        <Plus className="size-3" /> Add label
      </Button>
    </div>
  );
}
