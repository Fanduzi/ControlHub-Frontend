# CMDB Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical UX/UI issues and implement CMDB redesign: merge Resources+CMDB pages, add database type icons, cluster instance tables, relation name display, and dark theme fixes.

**Architecture:** Phase-based execution — P0 frontend fixes first (no backend), then backend API extensions, then P1 frontend features that depend on backend. Each phase produces working, testable software.

**Tech Stack:** Go 1.26 (backend), Next.js 16 + React 19 + TypeScript + shadcn/ui + Tailwind CSS v4 (frontend), TanStack Table, MySQL 8.0

---

## Phase 1: P0 Frontend Fixes (No Backend Changes)

### Task 1: Search Input Debounce

**Files:**
- Modify: `components/resources/resource-table.tsx` (lines 291-302)
- Modify: `components/databases/database-table.tsx` (lines ~160-165)

- [ ] **Step 1: Add useDebounce hook**

Create `hooks/use-debounce.ts`:

```tsx
import { useCallback, useRef } from "react";

export function useDebounceCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  ) as T;
}
```

- [ ] **Step 2: Apply debounce to resource-table.tsx search**

In `components/resources/resource-table.tsx`, replace the `onChange` handler at ~line 293:

```tsx
// Before:
onChange={(event) => {
  const nextValue = event.target.value;
  setSearchDraft(nextValue);
  replaceSearchParams({
    q: nextValue.trim() ? nextValue.trim() : null,
  });
}}

// After:
const debouncedSearch = useDebounceCallback(
  (value: string) => {
    replaceSearchParams({ q: value.trim() || null });
  },
  300,
);

onChange={(event) => {
  const nextValue = event.target.value;
  setSearchDraft(nextValue);
  debouncedSearch(nextValue);
}}
```

Add the import at the top:
```tsx
import { useDebounceCallback } from "@/hooks/use-debounce";
```

- [ ] **Step 3: Apply same debounce to database-table.tsx**

Apply identical pattern to `components/databases/database-table.tsx`.

- [ ] **Step 4: Verify locally**

Run `npm run dev` and type in search — input should be responsive, URL params should update after 300ms pause.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-debounce.ts components/resources/resource-table.tsx components/databases/database-table.tsx
git commit -m "fix: add 300ms debounce to search inputs to prevent request storms"
```

---

### Task 2: ApiError Dark Theme Fix

**Files:**
- Modify: `components/blocks/api-error.tsx` (lines 24-35)

- [ ] **Step 1: Replace hardcoded colors with design tokens**

Replace lines 24-35 in `components/blocks/api-error.tsx`:

```tsx
// Before:
<div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-5">
  <p className="text-sm font-medium text-rose-900">{t("title")}</p>
  <p className="mt-1 text-sm text-rose-700">{message}</p>
  {reset ? (
    <button
      type="button"
      onClick={reset}
      className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-50"
    >
      {common("actions.tryAgain")}
    </button>
  ) : null}
</div>

// After:
<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5">
  <p className="text-sm font-medium text-destructive">{t("title")}</p>
  <p className="mt-1 text-sm text-destructive/80">{message}</p>
  {reset ? (
    <Button
      variant="outline"
      size="sm"
      onClick={reset}
      className="mt-3"
    >
      {common("actions.tryAgain")}
    </Button>
  ) : null}
</div>
```

Add Button import if not present:
```tsx
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Verify in dark and light themes**

Run `npm run dev`, trigger an error state (e.g. invalid API call), verify colors adapt in both themes.

- [ ] **Step 3: Commit**

```bash
git add components/blocks/api-error.tsx
git commit -m "fix: replace hardcoded rose colors in ApiError with design tokens for dark theme"
```

---

### Task 3: Overview Metrics Dark Theme Contrast Fix

**Files:**
- Modify: `components/overview/overview-content.tsx` (lines 151-169)

- [ ] **Step 1: Add dark: variants to metric numbers**

Replace the three metric `<p>` elements:

```tsx
// Degraded (line ~159):
<p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-400">

// Warning (line ~165):
<p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-400">

// Pending (line ~171):
<p className="mt-2 text-2xl font-semibold text-sky-600 dark:text-sky-400">
```

- [ ] **Step 2: Verify contrast**

Check that all three numbers are clearly readable in dark theme.

- [ ] **Step 3: Commit**

```bash
git add components/overview/overview-content.tsx
git commit -m "fix: add dark: variants to overview metrics for WCAG AA contrast"
```

---

### Task 4: Audit Link Hover Color Fix

**Files:**
- Modify: `components/audits/audit-table.tsx` (line 113)

- [ ] **Step 1: Remove hardcoded hover color**

Replace:
```tsx
className="font-medium text-foreground hover:text-sky-700"
```

With:
```tsx
className="font-medium text-primary hover:text-primary/80"
```

- [ ] **Step 2: Commit**

```bash
git add components/audits/audit-table.tsx
git commit -m "fix: replace hardcoded sky-700 hover with theme-aware primary color"
```

---

### Task 5: StatusBadge degraded/unknown Colors

**Files:**
- Modify: `components/blocks/status-badge.tsx` (lines 14-20)

- [ ] **Step 1: Add missing status colors**

In the `health` tone class string, append after the `critical` mapping:

```
data-[status=degraded]:bg-orange-500/10 data-[status=degraded]:text-orange-700 dark:data-[status=degraded]:text-orange-300 data-[status=unknown]:bg-muted data-[status=unknown]:text-muted-foreground
```

The full `health` string becomes:
```tsx
health:
  "border-transparent bg-primary/10 text-primary data-[status=healthy]:bg-emerald-500/10 data-[status=healthy]:text-emerald-700 dark:data-[status=healthy]:text-emerald-300 data-[status=warning]:bg-amber-500/10 data-[status=warning]:text-amber-700 dark:data-[status=warning]:text-amber-300 data-[status=critical]:bg-rose-500/10 data-[status=critical]:text-rose-700 dark:data-[status=critical]:text-rose-300 data-[status=degraded]:bg-orange-500/10 data-[status=degraded]:text-orange-700 dark:data-[status=degraded]:text-orange-300 data-[status=unknown]:bg-muted data-[status=unknown]:text-muted-foreground",
```

In the `lifecycle` tone class string, add `stopped` and `decommissioning`:
```
data-[status=stopped]:bg-muted data-[status=stopped]:text-muted-foreground data-[status=decommissioning]:bg-muted/50 data-[status=decommissioning]:text-muted-foreground
```

- [ ] **Step 2: Verify by finding resources with these statuses**

Check that degraded resources show orange, unknown show gray, stopped show muted.

- [ ] **Step 3: Commit**

```bash
git add components/blocks/status-badge.tsx
git commit -m "fix: add explicit colors for degraded, unknown, stopped, decommissioning statuses"
```

---

### Task 6: Table Row Keyboard Accessibility

**Files:**
- Modify: `components/resources/resource-table.tsx` (lines ~394-398)
- Modify: `components/databases/database-table.tsx` (similar row click)
- Modify: `components/ui/table.tsx` (add focus-visible to TableRow)

- [ ] **Step 1: Add focus-visible to TableRow base component**

In `components/ui/table.tsx`, update the `TableRow` function's className:

```tsx
// Add focus-visible styles:
"border-b transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring/50"
```

- [ ] **Step 2: Change resource-table.tsx row to use first-column Link**

Replace the row click pattern:

```tsx
// Before:
<TableRow
  className={`cursor-pointer${row.original.isArchived ? " opacity-60" : ""}`}
  onClick={() => setSelectedResource(row.original)}
>

// After:
<TableRow
  className={`${row.original.isArchived ? " opacity-60" : ""}`}
>
```

Change the displayName cell to include the click handler:

```tsx
columnHelper.accessor("displayName", {
  header: t("common.fields.resource"),
  cell: ({ row }) => (
    <button
      type="button"
      className="font-medium text-left text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring/50"
      onClick={() => setSelectedResource(row.original)}
    >
      {row.original.displayName}
    </button>
  ),
}),
```

- [ ] **Step 3: Apply same pattern to database-table.tsx**

- [ ] **Step 4: Test keyboard navigation**

Tab through table rows, verify Enter on the resource name opens the detail sheet.

- [ ] **Step 5: Commit**

```bash
git add components/ui/table.tsx components/resources/resource-table.tsx components/databases/database-table.tsx
git commit -m "fix: add keyboard accessibility to table rows, replace tr onClick with button"
```

---

### Task 7: Relation Panel — Replace UUID Input with Resource Search Combobox

**Files:**
- Modify: `components/blocks/resource-relation-panel.tsx` (lines 127-170)
- Create: `components/blocks/resource-search-combobox.tsx`

- [ ] **Step 1: Create ResourceSearchCombobox component**

Create `components/blocks/resource-search-combobox.tsx`:

```tsx
"use client";

import { useState } from "react";
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
  excludeIds?: string[];
}

export function ResourceSearchCombobox({
  onSelect,
  excludeIds = [],
}: ResourceSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function handleSearch(value: string) {
    setSearch(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await listResources({ q: value, pageSize: 20 });
      const items = "items" in response ? response.items : response;
      setResults(
        (items as Resource[]).filter((r) => !excludeIds.includes(r.id)),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between border-border bg-background text-sm font-normal"
        >
          {search || "Search resources..."}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name..."
            value={search}
            onValueChange={handleSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> Searching...
                </span>
              ) : (
                "No resources found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {results.map((resource) => (
                <CommandItem
                  key={resource.id}
                  value={resource.id}
                  onSelect={() => {
                    onSelect(resource);
                    setOpen(false);
                    setSearch("");
                    setResults([]);
                  }}
                >
                  <Check className={cn("mr-2 size-4", search === resource.id ? "opacity-100" : "opacity-0")} />
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
```

- [ ] **Step 2: Install shadcn Command component if missing**

```bash
npx shadcn@latest add command popover
```

- [ ] **Step 3: Replace UUID input in resource-relation-panel.tsx**

Replace the target ID input section (~lines 127-139):

```tsx
// Before: plain Input for UUID
<Input
  value={targetId}
  onChange={(e) => { setTargetId(e.target.value); setError(null); }}
  placeholder={mt("relation.targetPlaceholder")}
  className="h-8 border-border bg-background text-sm"
/>

// After: ResourceSearchCombobox
<ResourceSearchCombobox
  onSelect={(resource) => {
    setTargetId(resource.id);
    setError(null);
  }}
  excludeIds={[resourceId]}
/>
```

Add import:
```tsx
import { ResourceSearchCombobox } from "./resource-search-combobox";
```

- [ ] **Step 4: Test — open add relation, search for a resource, select it**

- [ ] **Step 5: Commit**

```bash
git add components/blocks/resource-search-combobox.tsx components/blocks/resource-relation-panel.tsx
git commit -m "feat: replace UUID input with searchable resource combobox for adding relations"
```

---

### Task 8: EmptyState Component Enhancement

**Files:**
- Modify: `components/blocks/empty-state.tsx`

- [ ] **Step 1: Extend EmptyState with icon and action props**

```tsx
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      {icon && <div className="mb-3 text-muted-foreground/50">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Update existing EmptyState usages to pass icon where appropriate**

Search for `<EmptyState` across the codebase and add `icon` prop (e.g., `<Inbox />` from lucide-react for empty tables).

- [ ] **Step 3: Commit**

```bash
git add components/blocks/empty-state.tsx
git commit -m "feat: extend EmptyState with icon and action CTA props"
```

---

### Task 9: Topbar Quick Action — Bind to Create Resource

**Files:**
- Modify: `components/app-shell/topbar.tsx` (lines 145-148)

- [ ] **Step 1: Add state and wire the button**

In `topbar.tsx`, add state and onClick:

```tsx
const [showCreate, setShowCreate] = useState(false);

// ... in the JSX, replace lines 145-148:
<Button
  variant="outline"
  size="sm"
  className="gap-2"
  onClick={() => setShowCreate(true)}
>
  <Plus className="size-4" />
  {t("shell.quickAction")}
</Button>

// Add CreateResourceSheet at end of component:
{showCreate && (
  <CreateResourceSheet
    open={showCreate}
    onOpenChange={setShowCreate}
  />
)}
```

Add imports:
```tsx
import { useState } from "react";
import { CreateResourceSheet } from "@/components/resources/create-resource-sheet";
```

- [ ] **Step 2: Test — click Quick Action button, verify Create sheet opens**

- [ ] **Step 3: Commit**

```bash
git add components/app-shell/topbar.tsx
git commit -m "fix: wire Quick Action button to Create Resource sheet"
```

---

### Task 10: Dark Theme Border Visibility

**Files:**
- Modify: `app/globals.css` (line ~102, the `--border` variable in dark theme)

- [ ] **Step 1: Increase border opacity in dark theme**

Find the dark theme `--border` definition:
```css
--border: oklch(1 0 0 / 12%);
```

Change to:
```css
--border: oklch(1 0 0 / 15%);
```

- [ ] **Step 2: Verify nested cards are distinguishable**

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "fix: increase dark theme border opacity for better card separation"
```

---

## Phase 2: Backend API Extensions

### Task 11: B1 — Resource List API with profileSummary

**Files:**
- Modify: `internal/model/resource.go` — add ProfileSummary type
- Modify: `internal/api/resource_handler.go` — extend list response
- Modify: `internal/service/resource_service.go` — add profile lookup
- Modify: `internal/repository/mysql/resource_repository.go` — optional profile join
- Modify: `internal/openapi/openapi.yaml` — update Resource schema

- [ ] **Step 1: Define ProfileSummary model**

In `internal/model/resource.go`, add:

```go
type ProfileSummary struct {
    Hostname  *string `json:"hostname,omitempty"`
    IP        *string `json:"ip,omitempty"`
    Port      *int    `json:"port,omitempty"`
    NodeCount *int    `json:"nodeCount,omitempty"`
    Engine    *string `json:"engine,omitempty"`
}
```

- [ ] **Step 2: Add ProfileSummary field to Resource response**

Add a non-persisted field to Resource struct (or use a response wrapper):

```go
// Add to Resource struct:
ProfileSummary *ProfileSummary `json:"profileSummary,omitempty"`
```

- [ ] **Step 3: Implement profile enrichment in service layer**

In `resource_service.go`, after listing resources, batch-load profile summaries for database resources. Query `resource_profiles_database_instance` and `resource_profiles_database_cluster` tables.

- [ ] **Step 4: Add test for list with profileSummary**

Write test in `internal/api/` verifying the response includes `profileSummary` for database resources.

Run: `go test ./internal/api -v -run TestListResources`

- [ ] **Step 5: Update OpenAPI spec**

Add `profileSummary` to the Resource schema in `internal/openapi/openapi.yaml`.

Run: `make openapi-validate`

- [ ] **Step 6: Commit**

```bash
git add internal/model/resource.go internal/api/resource_handler.go internal/service/ internal/repository/ internal/openapi/openapi.yaml
git commit -m "feat: add profileSummary to resource list API response"
```

---

### Task 12: B2 — Relations API with Enriched Related Resource

**Files:**
- Modify: `internal/model/relation.go` — add RelatedResource type
- Modify: `internal/api/relation_handler.go` — extend response
- Modify: `internal/service/relation_service.go` — enrich with resource lookup
- Modify: `internal/openapi/openapi.yaml` — update ResourceRelation schema

- [ ] **Step 1: Define RelatedResource type**

In `internal/model/relation.go`, add:

```go
type RelatedResource struct {
    ID           string   `json:"id"`
    DisplayName  string   `json:"displayName"`
    ResourceType string   `json:"resourceType"`
    HealthStatus string   `json:"healthStatus"`
}
```

Add to ResourceRelation:
```go
RelatedResource *RelatedResource `json:"relatedResource,omitempty"`
```

- [ ] **Step 2: Enrich relations in service layer**

In `relation_service.go`, after fetching relations, collect all unique `fromResourceID` and `toResourceID` values, batch-fetch those resources, and attach to each relation.

- [ ] **Step 3: Update OpenAPI spec**

Add `relatedResource` to the ResourceRelation schema.

- [ ] **Step 4: Commit**

```bash
git add internal/model/relation.go internal/api/relation_handler.go internal/service/relation_service.go internal/openapi/openapi.yaml
git commit -m "feat: enrich relations API with related resource name and type"
```

---

### Task 13: B3 — Cluster Members API

**Files:**
- Modify: `internal/api/resource_handler.go` — add members to detail response
- Modify: `internal/service/resource_service.go` — aggregate members

- [ ] **Step 1: Add members field to resource detail response**

When `resourceType == "database_cluster"`, the detail handler returns an additional `members` array.

Define the response wrapper:
```go
type ResourceDetailResponse struct {
    Resource model.Resource      `json:"resource"`
    Members  []model.Resource    `json:"members,omitempty"`
}
```

- [ ] **Step 2: Implement member aggregation in service**

Query `resource_relations WHERE relation_type = 'member_of'` to find member instance IDs, then batch-fetch those resources with their profile summaries.

- [ ] **Step 3: Update OpenAPI spec**

- [ ] **Step 4: Commit**

```bash
git add internal/api/resource_handler.go internal/service/resource_service.go internal/openapi/openapi.yaml
git commit -m "feat: add cluster members to database_cluster resource detail response"
```

---

## Phase 3: P1 Frontend Features

### Task 14: Merge Resources + CMDB Pages

**Files:**
- Delete: `app/(console)/cmdb/page.tsx`
- Delete: `components/cmdb/cmdb-table.tsx`
- Modify: `components/resources/resource-table.tsx` — add column visibility toggles
- Modify: `lib/navigation.ts` — remove CMDB nav entry
- Modify: `components/app-shell/sidebar.tsx` — references removed

- [ ] **Step 1: Add column visibility state to resource-table.tsx**

Import TanStack Table's column visibility feature and add a "Customize columns" DropdownMenu button to the toolbar.

Add CMDB-specific columns (externalId, source, labels count) as optional columns, hidden by default:

```tsx
columnHelper.accessor("externalId", {
  header: "External ID",
  cell: (info) => (
    <span className="font-mono text-xs text-muted-foreground">
      {info.getValue() || "—"}
    </span>
  ),
}),
```

- [ ] **Step 2: Add column toggle DropdownMenu**

```tsx
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";

// In toolbar:
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="gap-2">
      <Columns3 className="size-4" />
      Columns
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {table.getAllLeafColumns().map((column) => (
      <DropdownMenuCheckboxItem
        key={column.id}
        checked={column.getIsVisible()}
        onCheckedChange={(value) => column.toggleVisibility(!!value)}
      >
        {column.id}
      </DropdownMenuCheckboxItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 3: Remove CMDB navigation entry**

In `lib/navigation.ts`, remove the `cmdb` entry (lines ~20-24).

- [ ] **Step 4: Delete CMDB page and component**

Delete `app/(console)/cmdb/` directory and `components/cmdb/` directory.

- [ ] **Step 5: Verify navigation works without CMDB**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: merge CMDB page into Resources with column visibility toggle, remove /cmdb route"
```

---

### Task 15: Database Type Icons

**Files:**
- Create: `public/icons/db/mysql.svg`
- Create: `public/icons/db/postgresql.svg`
- Create: `public/icons/db/redis.svg`
- Create: `public/icons/db/mongodb.svg`
- Create: `public/icons/db/tidb.svg`
- Create: `public/icons/db/proxysql.svg`
- Create: `public/icons/db/generic.svg`
- Create: `components/blocks/db-type-icon.tsx`

- [ ] **Step 1: Download official SVG logos**

Download from official brand pages:
- MySQL: https://www.mysql.com/about/legal/logos.html (simplified dolphin)
- PostgreSQL: https://www.postgresql.org/about/press/ (elephant)
- Redis: https://redis.io/about/ (stacked blocks)
- MongoDB: https://www.mongodb.com/company/brand-assets (leaf)
- TiDB: https://pingcap.com/brand/ (T logo)
- ProxySQL: use a generic proxy icon

Save as monochrome or simplified SVGs, 24x24 viewBox.

- [ ] **Step 2: Create DbTypeIcon component**

Create `components/blocks/db-type-icon.tsx`:

```tsx
import Image from "next/image";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

const subtypeIconMap: Record<string, string> = {
  mysql: "/icons/db/mysql.svg",
  postgresql: "/icons/db/postgresql.svg",
  redis: "/icons/db/redis.svg",
  mongodb: "/icons/db/mongodb.svg",
  tidb: "/icons/db/tidb.svg",
  proxysql: "/icons/db/proxysql.svg",
};

interface DbTypeIconProps {
  subtype?: string;
  className?: string;
}

export function DbTypeIcon({ subtype, className }: DbTypeIconProps) {
  const src = subtype ? subtypeIconMap[subtype] : undefined;

  if (!src) {
    return <Database className={cn("size-5 text-muted-foreground", className)} />;
  }

  return (
    <Image
      src={src}
      alt={subtype ?? "database"}
      width={20}
      height={20}
      className={cn("shrink-0", className)}
    />
  );
}
```

- [ ] **Step 3: Add icon column to resource-table.tsx**

Add as first column before displayName:

```tsx
{
  id: "icon",
  size: 36,
  enableHiding: false,
  cell: ({ row }) => {
    const type = row.original.resourceType;
    const subtype = row.original.resourceSubtype;
    if (type === "database_instance" || type === "database_cluster" || type === "database_proxy") {
      return <DbTypeIcon subtype={subtype} />;
    }
    return null;
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add public/icons/db/ components/blocks/db-type-icon.tsx components/resources/resource-table.tsx
git commit -m "feat: add database type icons (MySQL, PostgreSQL, Redis, MongoDB, TiDB)"
```

---

### Task 16: Resource Table Contextual Columns (hostname/IP/port)

**Files:**
- Modify: `types/resource.ts` — add profileSummary to Resource type
- Modify: `lib/view-models.ts` — map profileSummary
- Modify: `components/resources/resource-table.tsx` — add columns

- [ ] **Step 1: Update TypeScript types**

In `types/resource.ts`, add to the `Resource` interface:

```tsx
profileSummary?: {
  hostname?: string;
  ip?: string;
  port?: number;
  nodeCount?: number;
  engine?: string;
} | null;
```

- [ ] **Step 2: Add columns to resource-table.tsx**

After the "Status" column, add:

```tsx
columnHelper.accessor("profileSummary", {
  id: "hostname",
  header: "Hostname",
  cell: (info) => {
    const summary = info.getValue();
    if (!summary?.hostname) return <span className="text-muted-foreground">—</span>;
    return <span className="text-sm text-muted-foreground">{summary.hostname}</span>;
  },
}),
columnHelper.accessor("profileSummary", {
  id: "ip",
  header: "IP",
  cell: (info) => {
    const summary = info.getValue();
    if (!summary?.ip) return <span className="text-muted-foreground">—</span>;
    return <span className="font-mono text-xs text-muted-foreground">{summary.ip}</span>;
  },
}),
columnHelper.accessor("profileSummary", {
  id: "port",
  header: "Port",
  cell: (info) => {
    const summary = info.getValue();
    if (!summary?.port) return <span className="text-muted-foreground">—</span>;
    return <span className="font-mono text-xs text-muted-foreground">{summary.port}</span>;
  },
}),
```

These columns should be hidden by default in the column visibility state (only visible when user enables them or when filtered to database types).

- [ ] **Step 3: Commit**

```bash
git add types/resource.ts lib/view-models.ts components/resources/resource-table.tsx
git commit -m "feat: add hostname, IP, port columns to resource table for database instances"
```

---

### Task 17: Relation Panel — Display Names Instead of UUIDs

**Files:**
- Modify: `types/view-models.ts` — update ResourceRelationViewModel
- Modify: `components/blocks/resource-relation-panel.tsx` (lines 184-215)

- [ ] **Step 1: Update ResourceRelationViewModel type**

In `types/view-models.ts`, ensure the relation view model includes:

```tsx
export interface ResourceRelationViewModel {
  id: string;
  relationType: string;
  direction: "incoming" | "outgoing";
  relatedResourceId: string;
  relatedResourceName: string;
  relatedResourceType?: string;
  relatedResourceHealthStatus?: string;
}
```

- [ ] **Step 2: Update relation rendering in resource-relation-panel.tsx**

Replace lines 184-215:

```tsx
relations.map((relation) => (
  <Link
    key={relation.id}
    href={`/resources/${relation.relatedResourceId}`}
    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:bg-muted/50"
  >
    <div>
      <p className="text-sm font-medium text-foreground">
        {relation.relatedResourceName}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {relation.relatedResourceType && formatLabel(relation.relatedResourceType)}
        {relation.relatedResourceType && " · "}
        {formatLabel(relation.relationType)} · {relation.direction}
      </p>
    </div>
    <div className="flex items-center gap-2">
      {relation.relatedResourceHealthStatus && (
        <StatusBadge status={relation.relatedResourceHealthStatus} tone="health" />
      )}
      {resourceId && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteRelation(relation.id);
          }}
          disabled={deletingId === relation.id}
          aria-label="Delete relation"
        >
          ×
        </Button>
      )}
    </div>
  </Link>
))
```

- [ ] **Step 3: Commit**

```bash
git add types/view-models.ts components/blocks/resource-relation-panel.tsx
git commit -m "feat: display resource names and types instead of UUIDs in relation panel"
```

---

### Task 18: Cluster Detail — Instance Table

**Files:**
- Modify: `types/resource.ts` — add members to detail type
- Modify: `lib/view-models.ts` — map members
- Modify: `app/(console)/resources/[id]/page.tsx` — add instance section
- Create: `components/resources/cluster-members-table.tsx`

- [ ] **Step 1: Update TypeScript types**

Add `members` field to the resource detail response type.

- [ ] **Step 2: Create ClusterMembersTable component**

Create `components/resources/cluster-members-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { StatusBadge } from "@/components/blocks/status-badge";
import type { ResourceListViewModel } from "@/types/view-models";

interface ClusterMembersTableProps {
  members: ResourceListViewModel[];
}

export function ClusterMembersTable({ members }: ClusterMembersTableProps) {
  const t = useTranslations();

  if (members.length === 0) return null;

  return (
    <div className="rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Component
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hostname
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Port
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.id}
              className="border-b border-border last:border-0"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/resources/${member.id}`}
                  className="flex items-center gap-2 font-medium text-foreground hover:text-primary"
                >
                  <DbTypeIcon subtype={member.resourceSubtype} />
                  {member.resourceSubtype
                    ? member.resourceSubtype.charAt(0).toUpperCase() + member.resourceSubtype.slice(1)
                    : "Instance"}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.hostname ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.port ?? "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={member.healthStatus} tone="health" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Add members section to resource detail page**

In `app/(console)/resources/[id]/page.tsx`, after the PageHeader, add:

```tsx
{resource.resourceType === "database_cluster" && members && members.length > 0 && (
  <DetailPanel
    title="Cluster Members"
    description={`${members.length} instance${members.length > 1 ? "s" : ""} in this cluster`}
  >
    <ClusterMembersTable members={members} />
  </DetailPanel>
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/resources/cluster-members-table.tsx app/\(console\)/resources/\[id\]/page.tsx types/resource.ts lib/view-models.ts
git commit -m "feat: add cluster members table to database_cluster resource detail page"
```

---

### Task 19: Labels Key-Value Editor

**Files:**
- Create: `components/blocks/labels-editor.tsx`
- Modify: `components/resources/create-resource-sheet.tsx` (lines 356-376)
- Modify: `components/resources/edit-resource-sheet.tsx` (lines 300-313)

- [ ] **Step 1: Create LabelsEditor component**

Create `components/blocks/labels-editor.tsx`:

```tsx
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
```

- [ ] **Step 2: Replace JSON textarea in create-resource-sheet.tsx**

Replace the labels textarea with:
```tsx
<LabelsEditor value={labels} onChange={setLabels} />
```

- [ ] **Step 3: Same replacement in edit-resource-sheet.tsx**

- [ ] **Step 4: Commit**

```bash
git add components/blocks/labels-editor.tsx components/resources/create-resource-sheet.tsx components/resources/edit-resource-sheet.tsx
git commit -m "feat: replace JSON textarea with visual key-value labels editor"
```

---

### Task 20: DataTableShell Loading State

**Files:**
- Modify: `components/blocks/data-table-shell.tsx`

- [ ] **Step 1: Add loading prop with skeleton rows**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

interface DataTableShellProps {
  title: string;
  description?: string;
  controls?: ReactNode;
  pagination?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}

export function DataTableShell({
  title,
  description,
  controls,
  pagination,
  loading,
  children,
}: DataTableShellProps) {
  return (
    <section className="rounded-xl border border-border bg-card">
      {/* ... existing header ... */}
      <div>
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[120px]" />
              </div>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
      {/* ... existing pagination ... */}
    </section>
  );
}
```

- [ ] **Step 2: Use loading prop in resource-table.tsx**

Pass `loading` prop to DataTableShell while data is being fetched.

- [ ] **Step 3: Commit**

```bash
git add components/blocks/data-table-shell.tsx components/resources/resource-table.tsx
git commit -m "feat: add loading skeleton state to DataTableShell"
```

---

### Task 21: Unify Sheet and Detail Page Section Order

**Files:**
- Modify: `components/resources/resource-detail-sheet.tsx`
- Modify: `app/(console)/resources/[id]/page.tsx`

- [ ] **Step 1: Define shared section order**

Both views should use: Summary/Identity → Profile → Relations → Topology → Audit.

Reorder sections in `resources/[id]/page.tsx` to match the Sheet order.

- [ ] **Step 2: Commit**

```bash
git add app/\(console\)/resources/\[id\]/page.tsx components/resources/resource-detail-sheet.tsx
git commit -m "refactor: unify section order between resource detail sheet and full page"
```

---

## Phase 4: P2 Improvements (Optional)

### Task 22: Relative Time Display

**Files:**
- Modify: `lib/format.ts` — add `formatRelativeDateTime`

- [ ] **Step 1: Add relative time function**

```tsx
export function formatRelativeDateTime(date: string | Date): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const hours = Math.floor(diffHours);
    return `${hours}h ago`;
  }

  return formatDateTime(d);
}
```

- [ ] **Step 2: Use in table columns**

Replace `formatDateTime(row.original.updatedAt)` with `formatRelativeDateTime(row.original.updatedAt)`.

- [ ] **Step 3: Commit**

```bash
git add lib/format.ts components/resources/resource-table.tsx
git commit -m "feat: show relative time for updates within 24 hours"
```

---

### Task 23: Breadcrumb Navigation

**Files:**
- Modify: `app/(console)/resources/[id]/page.tsx`

- [ ] **Step 1: Add breadcrumb above PageHeader**

```tsx
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

// Before PageHeader:
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/resources">Resources</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <span className="text-muted-foreground">{resource.displayName}</span>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

- [ ] **Step 2: Commit**

```bash
git add app/\(console\)/resources/\[id\]/page.tsx
git commit -m "feat: add breadcrumb navigation to resource detail page"
```

---

## Task Dependency Map

```
Phase 1 (Tasks 1-10): All independent, can run in parallel
Phase 2 (Tasks 11-13): Backend, can run in parallel
Phase 3:
  Task 14 (merge pages): Independent
  Task 15 (db icons): Independent
  Task 16 (contextual columns): Depends on Task 11 (backend B1)
  Task 17 (relation names): Depends on Task 12 (backend B2)
  Task 18 (cluster members): Depends on Task 13 (backend B3)
  Task 19 (labels editor): Independent
  Task 20 (loading state): Independent
  Task 21 (section order): Independent
Phase 4 (Tasks 22-23): Independent
```

## Spec Coverage Check

| Spec Item | Task |
|-----------|------|
| D1: Merge Resources+CMDB | Task 14 |
| D2: Contextual DB columns | Task 16 |
| D3: DB type icons | Task 15 |
| D4: Cluster instance table | Task 18 |
| D5: Relation names | Task 17 |
| D6: Search debounce | Task 1 |
| D7: Dark theme fixes | Tasks 2,3,4,5,10 |
| D8: Keyboard accessibility | Task 6 |
| D9: Relation combobox | Task 7 |
| D10: Labels editor | Task 19 |
| B1: profileSummary API | Task 11 |
| B2: Enriched relations API | Task 12 |
| B3: Cluster members API | Task 13 |
| P0-1 to P0-7 | Tasks 1-7 |
| P1-1 to P1-10 | Tasks 14-21 |
| P2 selected | Tasks 22-23 |
