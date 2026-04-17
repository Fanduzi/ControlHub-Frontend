"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type MultiSelectFilterOption = {
  value: string;
  label: string;
};

type MultiSelectFilterProps = {
  label: string;
  clearLabel?: string;
  options: MultiSelectFilterOption[];
  selectedValues: string[];
  onValuesChange: (values: string[]) => void;
  className?: string;
};

export function MultiSelectFilter({
  label,
  clearLabel,
  options,
  selectedValues,
  onValuesChange,
  className,
}: MultiSelectFilterProps) {
  const t = useTranslations();

  const handleToggle = useCallback(
    (value: string) => {
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      onValuesChange(next);
    },
    [selectedValues, onValuesChange],
  );

  const handleClearAll = useCallback(() => {
    onValuesChange([]);
  }, [onValuesChange]);

  const triggerText =
    selectedValues.length === 0
      ? label
      : selectedValues.length === 1
        ? `${label}: ${options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0]}`
        : `${label}: ${selectedValues.length}`;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          data-slot="multi-select-trigger"
          className={cn(
            "flex h-9 items-center justify-between gap-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20",
            className,
          )}
          aria-label={label}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[180px]">
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={() => handleToggle(option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          {selectedValues.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClearAll}>
                {clearLabel ?? t("common.actions.clearAll")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedValues.length > 0 && (
        <button
          type="button"
          onClick={handleClearAll}
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t("common.actions.clearAll")}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Read repeated URL parameter values for multi-select.
 * Returns an array of all values for the given key.
 */
export function readMultiSelectValues(
  searchParams: URLSearchParams,
  key: string,
): string[] {
  return searchParams.getAll(key).filter(Boolean);
}

/**
 * Build updated URL search params with multi-select values.
 * Removes all existing values for the key, then adds new ones.
 * Always resets page to 1.
 */
export function buildMultiSelectParams(
  searchParams: URLSearchParams,
  key: string,
  values: string[],
): URLSearchParams {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(key);
  params.delete("page");
  for (const value of values) {
    params.append(key, value);
  }
  return params;
}
