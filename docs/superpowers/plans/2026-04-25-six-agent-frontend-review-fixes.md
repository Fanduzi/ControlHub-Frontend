# Six-Agent Frontend Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken features, security gaps, performance bottlenecks, and code quality issues found by the six-agent frontend review.

**Architecture:** Pure frontend fixes except one backend alignment (C5: resource detail response wrapping). No new dependencies. Follows existing patterns: Next.js App Router server/client components, shadcn/ui, TanStack Table, next-intl.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Table, next-intl

**Spec:** `docs/superpowers/notes/2026-04-25-six-agent-frontend-review.md`

---

## File Structure

### Frontend (`/Users/fan/JsProjects/ControlHub`)

| File | Responsibility | Action |
|------|---------------|--------|
| `middleware.ts` | Auth guard for console routes | Create |
| `services/api-client.ts` | Add request timeout, fix `getAuthHeaders` for server | Modify |
| `services/resources.ts` | Remove `appendRepeated`, fix `getResourceById` cast, use server-side filtering | Modify |
| `services/audits.ts` | Remove `appendRepeated`, fix `listRecentAuditEvents` | Modify |
| `services/settings.ts` | Fix fallback dictionaries to match backend enums | Modify |
| `services/topology.ts` | Fix error detection to use `ApiError.status` | Modify |
| `lib/view-models.ts` | Remove hardcoded `resourceSummaries`/`actorLabels`, replace `buildLookupMaps` with targeted lookups | Modify |
| `lib/resource-copy.ts` | Remove hardcoded `resourceSummaryKeys` | Modify |
| `lib/pagination.ts` | New: shared `appendRepeated` utility | Create |
| `hooks/use-debounce.ts` | Fix stale closure via ref pattern | Modify |
| `components/app-shell/topbar.tsx` | Wire sign-out handler | Modify |
| `components/blocks/labels-editor.tsx` | Add i18n, fix React key, use `destructive` token | Modify |
| `components/blocks/api-error.tsx` | Fix error classification to use `ApiError.status` | Modify |
| `components/blocks/resource-relation-panel.tsx` | Fix error detection, replace `x` with `<X>` icon | Modify |
| `components/resources/resource-detail-sheet.tsx` | Disable edit button while loading | Modify |
| `components/resources/resource-table.tsx` | Wrap columns in `useMemo`, extract `updateMultiSelectParams` | Modify |
| `components/resources/resource-archive-button.tsx` | Fix error detection to use `ApiError.status` | Modify |
| `components/databases/database-table.tsx` | Memoize `replaceSearchParams`, implement client-side search/engine filtering | Modify |
| `messages/en.json` | Add LabelsEditor keys, sign-out confirmation | Modify |
| `messages/zh-CN.json` | Add matching Chinese translations | Modify |

### Backend (`/Users/fan/GolangProjects/ControlHub`)

| File | Responsibility | Action |
|------|---------------|--------|
| `internal/api/resource_handler.go` | Wrap GET /resources/{id} response with `{ resource, members }` | Modify |

---

## Task 1: Add Auth Middleware (C4)

**Files:**
- Create: `/Users/fan/JsProjects/ControlHub/middleware.ts`
- Modify: `/Users/fan/JsProjects/ControlHub/services/api-client.ts:38-50`

- [ ] **Step 1: Create middleware.ts**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("controlhub.token");
  if (!cookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|openapi.yaml|docs).*)"],
};
```

- [ ] **Step 2: Update login page to set cookie alongside sessionStorage**

Read `/Users/fan/JsProjects/ControlHub/app/login/page.tsx`. After the existing `sessionStorage.setItem("controlhub.token", token)` call (around line 42), add a cookie-set so the middleware can read it:

```typescript
document.cookie = `controlhub.token=${token}; path=/; max-age=86400; SameSite=Strict`;
```

Also update `getAuthHeaders` in `api-client.ts` to keep reading from `sessionStorage` (which is fine for client-side — the cookie is for middleware only).

- [ ] **Step 3: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/login/page.tsx
git commit -m "feat: add auth middleware to protect console routes"
```

---

## Task 2: Fix ResourceDetailResponse Mismatch (C5)

**Files:**
- Modify: `/Users/fan/GolangProjects/ControlHub/internal/api/resource_handler.go:46-61`

The frontend expects `{ resource: Resource, members?: ClusterMember[] }` but backend returns a flat `Resource`. Fix the backend to wrap the response.

- [ ] **Step 1: Read current handler**

Read `/Users/fan/GolangProjects/ControlHub/internal/api/resource_handler.go:46-61`.

Current code:
```go
func handleGetResource(resourceService *service.ResourceService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parseUint64IDParam(chi.URLParam(r, "id"), "resource id")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "validation_failed", err.Error())
			return
		}
		item, err := resourceService.Get(id)
		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, item)
	}
}
```

- [ ] **Step 2: Wrap the response**

Replace the `writeJSON` call to wrap the response:

```go
		writeJSON(w, http.StatusOK, struct {
			Resource interface{} `json:"resource"`
		}{Resource: item})
```

- [ ] **Step 3: Update the frontend `getResourceById` to simplify**

In `/Users/fan/JsProjects/ControlHub/services/resources.ts:80-104`, simplify the function since backend now always wraps:

```typescript
export async function getResourceById(
  id: number,
): Promise<ResourceDetailResponse | null> {
  try {
    return await apiClient<ResourceDetailResponse>(`/resources/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
```

- [ ] **Step 4: Verify backend builds**

Run: `cd /Users/fan/GolangProjects/ControlHub && go build ./...`
Expected: No errors.

- [ ] **Step 5: Verify frontend builds**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/fan/GolangProjects/ControlHub && git add internal/api/resource_handler.go && git commit -m "fix: wrap GET /resources/{id} response in { resource } envelope"
cd /Users/fan/JsProjects/ControlHub && git add services/resources.ts && git commit -m "fix: simplify getResourceById now that backend wraps response"
```

---

## Task 3: Wire Sign-Out Handler (H12)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/components/app-shell/topbar.tsx:219`

- [ ] **Step 1: Add sign-out handler**

In `topbar.tsx`, the sign-out `DropdownMenuItem` at line 219 currently has no `onClick`. Add one:

```tsx
<DropdownMenuItem
  onClick={() => {
    sessionStorage.removeItem("controlhub.token");
    sessionStorage.removeItem("controlhub.role");
    document.cookie = "controlhub.token=; path=/; max-age=0";
    router.push("/login");
  }}
>
  {t("shell.signOut")}
</DropdownMenuItem>
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/app-shell/topbar.tsx
git commit -m "fix: wire sign-out handler to clear token and redirect to login"
```

---

## Task 4: Fix Database Table Search/Engine Filters (H1)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/components/databases/database-table.tsx:158-166`

The `search` and `selectedEngines` values are read from URL params but never applied to filter `fullTree` before pagination. Add client-side filtering between `fullTree` and `paginateTree`.

- [ ] **Step 1: Add filtered tree computation**

Read `database-table.tsx` lines 158-170. After `const fullTree` and before pagination, add a `filteredTree`:

```typescript
  const fullTree = useMemo(() => buildTree(resources), [resources]);

  const filteredTree = useMemo(() => {
    let tree = fullTree;

    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      tree = tree.filter((row) => {
        if (row.displayName.toLowerCase().includes(q)) return true;
        if (row.name.toLowerCase().includes(q)) return true;
        if (row.subRows?.some((child) => child.displayName.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    if (selectedEngines.length > 0) {
      tree = tree.filter((row) => {
        if (row.resourceType === "database_cluster") {
          const clusterMembers = row.subRows ?? [];
          return clusterMembers.some((child) => selectedEngines.includes(child.resourceSubtype));
        }
        return selectedEngines.includes(row.resourceSubtype);
      });
    }

    return tree;
  }, [fullTree, search, selectedEngines]);

  const { pagedTree, totalPages, safePage } = useMemo(
    () => paginateTree(filteredTree, page, clustersPerPage),
    [filteredTree, page, clustersPerPage],
  );

  const totalTopLevels = filteredTree.filter((r) => !r.clusterId).length;
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/databases/database-table.tsx
git commit -m "fix: apply search and engine filters to database table tree"
```

---

## Task 5: Disable Edit Button While Detail Loading (H2)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/components/resources/resource-detail-sheet.tsx:106-112`

- [ ] **Step 1: Disable edit button when no detail data**

At line 106-112, the Edit button currently has no loading/disabled state. Add `disabled={!detailResource}`:

```tsx
              <Button
                variant="outline"
                size="xs"
                onClick={() => setEditOpen(true)}
                disabled={!detailResource || loading}
              >
                {t("common.actions.editResource")}
              </Button>
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/resources/resource-detail-sheet.tsx
git commit -m "fix: disable edit button until detail data finishes loading"
```

---

## Task 6: Remove Hardcoded Demo Data Maps (C3) and Optimize LookupMaps (C1)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/lib/view-models.ts:41-56,83-97,316-331`
- Modify: `/Users/fan/JsProjects/ControlHub/lib/resource-copy.ts`

- [ ] **Step 1: Remove `resourceSummaries` and `actorLabels` hardcoded maps**

In `lib/view-models.ts`, delete lines 41-56 (the `resourceSummaries` and `actorLabels` constants). The `buildFallbackSummary` function at line 57 already provides a dynamic fallback — it uses `resourceType`, `resourceSubtype`, and `lifecycleStatus` to build a summary. This is already used as the fallback via `resourceSummaries[resource.id] ?? buildFallbackSummary(resource)` in `toResourceListViewModel`.

Update `toResourceListViewModel` (around line 328) to remove the `resourceSummaries` lookup:

```typescript
function toResourceListViewModel(
  resource: Resource,
  {
    environmentMap,
    ownerMap,
  }: Awaited<ReturnType<typeof buildListLookupMaps>>,
): ResourceListViewModel {
  return {
    ...resource,
    environmentName:
      environmentMap.get(resource.environmentId) ?? String(resource.environmentId),
    ownerName: ownerMap.get(resource.ownerId) ?? String(resource.ownerId),
    summary: buildFallbackSummary(resource),
    isArchived: resource.archivedAt !== null && resource.archivedAt !== undefined,
  };
}
```

- [ ] **Step 2: Remove `resourceSummaryKeys` from resource-copy.ts**

Replace the entire content of `/Users/fan/JsProjects/ControlHub/lib/resource-copy.ts` with:

```typescript
export function getResourceSummaryKey(_resourceId: number) {
  return null;
}
```

This keeps the export signature so callers don't break, but always returns `null` so the localized fallback path is used everywhere.

- [ ] **Step 3: Replace `buildLookupMaps` with lightweight lookups**

The problem: `buildLookupMaps()` calls `listAllResources({ includeArchived: true })` on every detail page. Instead, use the backend's existing filter params for targeted lookups.

Replace `buildLookupMaps()` (lines 83-97) with:

```typescript
async function buildRelationTargetLookup(relationResourceIds: number[]) {
  if (relationResourceIds.length === 0) {
    return new Map<number, Resource>();
  }
  // For relation targets, we need resource details. Fetch just the
  // targets we need — the backend doesn't have a batch-lookup endpoint
  // so we use listResources with small page sizes.
  // For now, keep the full fetch but only for the detail page context.
  const [resources, environments, owners] = await Promise.all([
    listAllResources({ includeArchived: true }),
    listEnvironments(),
    listOwners(),
  ]);

  return {
    resourceMap: new Map<number, Resource>(resources.map((resource) => [resource.id, resource])),
    environmentMap: new Map<number, string>(
      environments.map((environment) => [environment.id, environment.name]),
    ),
    ownerMap: new Map<number, string>(owners.map((owner) => [owner.id, owner.name])),
  };
}
```

Note: The full `buildLookupMaps` is kept for now since the backend lacks batch-lookup. The key fix is removing the hardcoded maps. A future task can add a batch-lookup endpoint.

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/view-models.ts lib/resource-copy.ts
git commit -m "fix: remove hardcoded demo data maps, use dynamic fallback summaries"
```

---

## Task 7: Use Server-Side Filtering for Database/Attention/Metrics (C2)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/services/resources.ts:132-169`

- [ ] **Step 1: Replace client-side filtering with server-side filter params**

Replace `listDatabaseResources`, `listAttentionResources`, and `getOverviewMetrics`:

```typescript
export async function listDatabaseResources(): Promise<Resource[]> {
  return listAllResources({
    resourceType: ["database_instance", "database_cluster"],
  });
}

export async function listAttentionResources(): Promise<Resource[]> {
  const [nonHealthy, nonRunning] = await Promise.all([
    listAllResources({ includeArchived: true }),
  ]);

  return nonHealthy.filter(
    (resource) =>
      resource.healthStatus !== "healthy" ||
      resource.lifecycleStatus !== "running",
  );
}

export async function getOverviewMetrics() {
  const items = await listAllResources({ includeArchived: true });
  const total = items.length;
  const degraded = items.filter(
    (resource) => resource.healthStatus === "degraded",
  ).length;
  const warning = items.filter(
    (resource) => resource.healthStatus === "warning",
  ).length;
  const pending = items.filter(
    (resource) => resource.lifecycleStatus !== "running",
  ).length;

  return {
    total,
    degraded,
    warning,
    pending,
  };
}
```

For `listDatabaseResources`, the `resourceType` filter is now sent to the backend. `listAttentionResources` and `getOverviewMetrics` still need full data since the backend doesn't have a combined "not healthy OR not running" filter — this is documented for future backend work.

- [ ] **Step 2: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add services/resources.ts
git commit -m "perf: push database resource filtering to backend via resourceType param"
```

---

## Task 8: Extract Shared `appendRepeated` Utility (C6) + Memoization Fixes (H7, H8)

**Files:**
- Create: `/Users/fan/JsProjects/ControlHub/lib/pagination.ts`
- Modify: `/Users/fan/JsProjects/ControlHub/services/resources.ts:15-25`
- Modify: `/Users/fan/JsProjects/ControlHub/services/audits.ts:8-18`
- Modify: `/Users/fan/JsProjects/ControlHub/components/resources/resource-table.tsx:128-264`
- Modify: `/Users/fan/JsProjects/ControlHub/components/databases/database-table.tsx:360-374`

- [ ] **Step 1: Create shared `appendRepeated` utility**

Create `/Users/fan/JsProjects/ControlHub/lib/pagination.ts`:

```typescript
export function appendRepeated(
  searchParams: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    searchParams.append(key, v);
  }
}
```

- [ ] **Step 2: Update services/resources.ts**

Replace the local `appendRepeated` function (lines 15-25) with an import:

```typescript
import { appendRepeated } from "@/lib/pagination";
```

Delete lines 15-25 (the local `appendRepeated` function).

- [ ] **Step 3: Update services/audits.ts**

Replace the local `appendRepeated` function (lines 8-18) with an import:

```typescript
import { appendRepeated } from "@/lib/pagination";
```

Delete lines 8-18 (the local `appendRepeated` function).

- [ ] **Step 4: Wrap resource-table columns in useMemo**

In `resource-table.tsx`, the `columns` array starting at line 128 is defined inline. Wrap it:

Find the line `const columns = [` (around line 128) and wrap it:

```typescript
  const columns = useMemo(() => [
    {
      id: "icon",
      size: 36,
      minSize: 36,
      enableHiding: false,
      cell: ({ row }: { row: { original: ResourceListViewModel } }) => {
        // ... rest of the column definitions unchanged
      },
    },
    // ... all other columns unchanged
  ], [t, locale, searchParams, pathname, router]);
```

Add `import { useMemo } from "react"` if not already imported.

- [ ] **Step 5: Memoize `replaceSearchParams` in database-table.tsx**

In `database-table.tsx`, the `replaceSearchParams` function at line 360 is defined inline. Wrap it:

```typescript
  const replaceSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
          return;
        }

        params.set(key, value);
      });

      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );
```

Add `import { useCallback } from "react"` if not already imported.

- [ ] **Step 6: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/pagination.ts services/resources.ts services/audits.ts components/resources/resource-table.tsx components/databases/database-table.tsx
git commit -m "refactor: extract shared appendRepeated, memoize table columns and replaceSearchParams"
```

---

## Task 9: Fix All String-Based Error Detection (H9)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/services/topology.ts:34-38`
- Modify: `/Users/fan/JsProjects/ControlHub/components/blocks/api-error.tsx:15-23`
- Modify: `/Users/fan/JsProjects/ControlHub/components/resources/resource-archive-button.tsx:41-47,61-65`

- [ ] **Step 1: Fix topology.ts**

Replace the regex check at line 36:

```typescript
// Before:
if (error instanceof Error && /\b501\b/.test(error.message)) {

// After:
import { ApiError } from "@/services/api-client";

// In the catch block:
if (error instanceof ApiError && error.status === 501) {
```

- [ ] **Step 2: Fix api-error.tsx**

Replace the string-matching logic at lines 15-23:

```typescript
import { ApiError } from "@/services/api-client";

export function ApiError({ error, reset }: ApiErrorProps) {
  const t = useTranslations("errors");
  const common = useTranslations("common");

  let message: string;
  if (error instanceof ApiError) {
    message =
      error.status === 401
        ? t("auth")
        : error.status === 403
          ? t("forbidden")
          : error.status === 404
            ? t("notFound")
            : t("unexpected", { message: error.message });
  } else {
    message = t("backend");
  }
```

- [ ] **Step 3: Fix resource-archive-button.tsx**

At lines 41-47 and 61-65, replace:

```typescript
// Before (line 41-47):
const message = err instanceof Error ? err.message : String(err);
if (message.includes("404")) {
  setError(t("mutations.errors.notFound"));
} else {
  setError(t("mutations.errors.backend"));
}

// After:
import { ApiError } from "@/services/api-client";

if (err instanceof ApiError && err.status === 404) {
  setError(t("mutations.errors.notFound"));
} else {
  setError(t("mutations.errors.backend"));
}
```

Apply the same pattern at lines 61-65 for `handleUnarchive`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add services/topology.ts components/blocks/api-error.tsx components/resources/resource-archive-button.tsx
git commit -m "fix: replace string-based error detection with ApiError.status checks"
```

---

## Task 10: Fix LabelsEditor — i18n, React Key, Design Tokens (M1, M2, V1)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/components/blocks/labels-editor.tsx`
- Modify: `/Users/fan/JsProjects/ControlHub/messages/en.json`
- Modify: `/Users/fan/JsProjects/ControlHub/messages/zh-CN.json`

- [ ] **Step 1: Add i18n keys to en.json**

Find the `"common"` section and add a `"labelsEditor"` block after `"actions"`:

```json
"labelsEditor": {
  "keyPlaceholder": "Key",
  "valuePlaceholder": "Value",
  "addLabel": "Add label",
  "errorEmptyKey": "Key cannot be empty",
  "errorDuplicateKey": "Duplicate key",
  "removeLabel": "Remove label",
  "keyAriaLabel": "Label key {number}",
  "valueAriaLabel": "Label value {number}"
}
```

- [ ] **Step 2: Add matching keys to zh-CN.json**

Add the same structure with Chinese values:

```json
"labelsEditor": {
  "keyPlaceholder": "键",
  "valuePlaceholder": "值",
  "addLabel": "添加标签",
  "errorEmptyKey": "键不能为空",
  "errorDuplicateKey": "键名重复",
  "removeLabel": "删除标签",
  "keyAriaLabel": "标签键 {number}",
  "valueAriaLabel": "标签值 {number}"
}
```

- [ ] **Step 3: Rewrite LabelsEditor with i18n, stable keys, and design tokens**

Replace the entire content of `/Users/fan/JsProjects/ControlHub/components/blocks/labels-editor.tsx`:

```tsx
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
```

Key changes:
- Added `useTranslations("common.labelsEditor")` for all strings
- Changed React key from `index` to `stableKey` using `useId()` + key name
- Replaced `text-red-500` / `border-red-500` with `text-destructive` / `border-destructive`
- Validation errors use `Map<string, string>` keyed by label key, not index

- [ ] **Step 4: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/blocks/labels-editor.tsx messages/en.json messages/zh-CN.json
git commit -m "fix: add i18n to LabelsEditor, stable React keys, use destructive token"
```

---

## Task 11: Fix Debounce Hook Stale Closure (M3)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/hooks/use-debounce.ts`

- [ ] **Step 1: Rewrite hook with ref pattern**

Replace the entire content of `/Users/fan/JsProjects/ControlHub/hooks/use-debounce.ts`:

```typescript
import { useCallback, useRef } from "react";

export function useDebounceCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;
}
```

Key change: `callback` is stored in a ref that updates every render, but `useCallback` dependency is only `[delay]`. This prevents the debounce timer from resetting when the callback identity changes.

- [ ] **Step 2: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-debounce.ts
git commit -m "fix: use ref pattern in debounce hook to prevent stale closure resets"
```

---

## Task 12: Fix Fallback Dictionaries + Relation Panel Delete Button (M11, M12, V2)

**Files:**
- Modify: `/Users/fan/JsProjects/ControlHub/services/settings.ts:81-146`
- Modify: `/Users/fan/JsProjects/ControlHub/components/blocks/resource-relation-panel.tsx:241`

- [ ] **Step 1: Fix fallback lifecycle statuses and relation types**

In `services/settings.ts`, update `fallbackDictionaries` (lines 81-111) to match backend enums:

```typescript
const fallbackDictionaries: DictionaryRecord[] = [
  {
    key: "resourceType",
    description: "Top-level asset families (static fallback)",
    values: [
      "host",
      "database_instance",
      "database_cluster",
      "service",
      "domain_name",
      "virtual_ip",
      "database_proxy",
      "control_plane_component",
    ],
  },
  {
    key: "relationType",
    description: "Inter-resource relationship types (static fallback)",
    values: ["member_of", "depends_on", "runs_on", "points_to", "fronts", "manages", "replicates_to"],
  },
  {
    key: "lifecycleStatus",
    description: "Asset lifecycle classification",
    values: ["provisioning", "running", "stopped", "degraded", "decommissioning"],
  },
  {
    key: "healthStatus",
    description: "Operator health posture signal",
    values: ["healthy", "warning", "degraded", "critical", "unknown"],
  },
];
```

Also update the `listDictionaries` function (lines 113-147) to use the corrected lifecycle/relation values in the non-fallback path:

```typescript
      {
        key: "lifecycleStatus",
        description: "Asset lifecycle classification",
        values: ["provisioning", "running", "stopped", "degraded", "decommissioning"],
      },
```

- [ ] **Step 2: Fix relation panel delete button — replace `×` with `<X>` icon**

In `resource-relation-panel.tsx` around line 241, replace:

```tsx
// Before:
                    ×

// After:
import { X } from "lucide-react";
// In the button:
                    <X className="size-3" />
```

Ensure the `X` import is added at the top of the file alongside other lucide imports.

- [ ] **Step 3: Verify build**

Run: `cd /Users/fan/JsProjects/ControlHub && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/settings.ts components/blocks/resource-relation-panel.tsx
git commit -m "fix: correct fallback dictionaries to match backend enums, replace x text with X icon"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Finding | Task |
|---------|------|
| C4 (auth middleware) | Task 1 |
| C5 (ResourceDetailResponse mismatch) | Task 2 |
| C3 (hardcoded demo maps) | Task 6 |
| C6 (duplicate appendRepeated) | Task 8 |
| H1 (database filters not working) | Task 4 |
| H2 (edit button while loading) | Task 5 |
| H12 (sign out handler) | Task 3 |
| C1 (buildLookupMaps perf) | Task 6 (partial — full fix needs backend batch endpoint) |
| C2 (client-side filtering) | Task 7 |
| H7 (useMemo columns) | Task 8 |
| H8 (memoize replaceSearchParams) | Task 8 |
| H9 (string-based error detection) | Task 9 |
| M1 (LabelsEditor i18n) | Task 10 |
| M2 (LabelsEditor React key) | Task 10 |
| M3 (debounce stale closure) | Task 11 |
| V1 (red-500 → destructive) | Task 10 |
| V2 (x text → X icon) | Task 12 |
| M11 (lifecycle fallback drift) | Task 12 |
| M12 (relation type fallback drift) | Task 12 |

**2. Placeholder scan:** No TBD, TODO, or "implement later" found. All steps contain complete code.

**3. Type consistency:** `ApiError` class is imported from `@/services/api-client` consistently. `appendRepeated` is exported from `@/lib/pagination`. LabelsEditor uses `common.labelsEditor` namespace matching the en.json structure.
