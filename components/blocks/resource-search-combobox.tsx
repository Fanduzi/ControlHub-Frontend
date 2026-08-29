// input: React, resource list service, and optional server-derived type/environment filters
// output: Debounced resource search selector constrained by caller-supplied relationship rules
// pos: Reusable target candidate picker; never owns relationship policy
// note: if this file changes, update this header and components/blocks/README.md.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { listResources } from "@/services/resources";
import type { Resource } from "@/types/resource";

interface ResourceSearchComboboxProps {
  onSelect: (resource: Resource) => void;
  excludeIds?: number[];
  resourceTypes?: Resource["resourceType"][];
  environmentId?: number;
  disabled?: boolean;
}

export function ResourceSearchCombobox({
  onSelect,
  excludeIds = [],
  resourceTypes,
  environmentId,
  disabled = false,
}: ResourceSearchComboboxProps) {
  const t = useTranslations("relations");
  const ct = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (disabled || value.length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const response = await listResources({
          q: value,
          pageSize: 20,
          resourceType: resourceTypes,
          environmentId,
        });
        if (controller.signal.aborted) return;
        setResults(response.items.filter((r) => !excludeIds.includes(r.id)));
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
  }, [disabled, environmentId, excludeIds, resourceTypes]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          className="h-8 w-full justify-between border-border bg-background text-sm font-normal"
          disabled={disabled}
        >
          {selectedName || t("searchPlaceholder")}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("searchPlaceholder")}
            onValueChange={handleSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <span className="flex items-center justify-center gap-2 py-6 text-sm">
                  <Loader2 className="size-3 animate-spin" /> {ct("loading")}
                </span>
              ) : (
                ct("noResults")
              )}
            </CommandEmpty>
            <CommandGroup>
              {results.map((resource) => (
                <CommandItem
                  key={resource.id}
                  value={String(resource.id)}
                  onSelect={() => {
                    onSelect(resource);
                    setOpen(false);
                    setSelectedName(resource.displayName);
                    setResults([]);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      selectedName === resource.displayName
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="font-medium">{resource.displayName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {resource.resourceType}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
