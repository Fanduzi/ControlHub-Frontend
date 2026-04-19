"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LabelsEditorProps {
  value: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}

export function LabelsEditor({ value, onChange }: LabelsEditorProps) {
  const entries = Object.entries(value);

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
    onChange({ ...value, "": "" });
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val], index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={key}
            onChange={(e) => updateEntry(index, "key", e.target.value)}
            placeholder="Key"
            className="h-8 border-border bg-background text-sm"
          />
          <Input
            value={val}
            onChange={(e) => updateEntry(index, "value", e.target.value)}
            placeholder="Value"
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
      ))}
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
