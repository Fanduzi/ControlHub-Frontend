"use client";

import { useState } from "react";
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
}

export function ResourceSearchCombobox({
  onSelect,
  excludeIds = [],
}: ResourceSearchComboboxProps) {
  const t = useTranslations("relations");
  const ct = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");

  async function handleSearch(value: string) {
    if (value.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await listResources({ q: value, pageSize: 20 });
      const items = response.items;
      setResults(
        items.filter((r) => !excludeIds.includes(r.id)),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          className="h-8 w-full justify-between border-border bg-background text-sm font-normal"
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
