# Query Database Context and Quick Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated worksheet database metadata context and a safe Cmd/Ctrl+P object navigator.

**Architecture:** Keep context in `LocalWorksheet`, route metadata/reveal state through `QueryWorkbench`, and keep SQL insertion in a pure helper plus explicit CodeMirror dispatch. Use the existing schema service/store for bounded metadata requests and Base UI dialog primitives for accessibility.

**Tech Stack:** Next.js client components, React, TypeScript, Base UI dialog, CodeMirror, Vitest, Testing Library, next-intl.

## Global Constraints

- Never emit `USE <database>` or execute SQL when database context changes or an object is selected.
- Restrict navigation to the active target; search only databases, tables, views, and cached columns.
- Quote all identifier parts with backticks and escape embedded backticks by doubling them.
- Use bounded server pages and columns only from `QuerySchemaStore` ready details.
- Keep all user-visible copy in `messages/en.json` and `messages/zh-CN.json`.

---

### Task 1: Identifier helpers

**Files:**
- Create: `lib/query-identifiers.ts`
- Test: `tests/lib/query-identifiers.test.ts`

**Interfaces:**
- Produces `quoteQueryIdentifier(name: string): string` and `objectIdentifier({ database, name, activeDatabase }): string`.
- Produces `replaceEditorSelection(view: EditorView, text: string): void`.

- [ ] **Step 1: Write failing helper tests**

```ts
expect(quoteQueryIdentifier("user`name")).toBe("`user``name`");
expect(objectIdentifier({ database: "app", name: "orders", activeDatabase: "app" })).toBe("`orders`");
expect(objectIdentifier({ database: "audit", name: "order items", activeDatabase: "app" })).toBe("`audit`.`order items`");
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run tests/lib/query-identifiers.test.ts`
Expected: FAIL because `@/lib/query-identifiers` does not exist.

- [ ] **Step 3: Implement minimal helpers**

```ts
export function quoteQueryIdentifier(name: string) {
  return `\`${name.replaceAll("`", "``")}\``;
}
export function objectIdentifier({ database, name, activeDatabase }: ObjectIdentifierInput) {
  const object = quoteQueryIdentifier(name);
  return database === activeDatabase ? object : `${quoteQueryIdentifier(database)}.${object}`;
}
export function replaceEditorSelection(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
}
```

- [ ] **Step 4: Run helper tests**

Run: `npx vitest run tests/lib/query-identifiers.test.ts`
Expected: PASS.

### Task 2: Per-worksheet metadata database context

**Files:**
- Modify: `components/query/query-editor-shell.tsx`
- Modify: `components/query/query-workbench.tsx`
- Test: `tests/components/query-workbench.test.tsx`

**Interfaces:**
- `LocalWorksheet.activeDatabase: string | null` is private worksheet state.
- `QueryEditorShell` exposes active worksheet context with `onActiveDatabaseChange(database: string | null)` and accepts metadata default initialization.

- [ ] **Step 1: Write failing workbench tests**

```tsx
expect(await screen.findByText("app_db")).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Add worksheet" }));
// change database in worksheet 2, switch tabs, and assert worksheet 1 retains app_db
expect(executeQueryTarget).not.toHaveBeenCalled();
expect(fetchMock).not.toHaveBeenCalledWith(expect.stringMatching(/USE%20/i));
```

- [ ] **Step 2: Run the failing workbench test**

Run: `npx vitest run tests/components/query-workbench.test.tsx`
Expected: FAIL because worksheet database context is absent.

- [ ] **Step 3: Implement guarded context**

```ts
type LocalWorksheet = { /* existing fields */ activeDatabase: string | null };
// createWorksheet: activeDatabase: null
// guarded metadata completion: update only matching worksheet id, target id, and metadata generation;
// set default only when current activeDatabase is null.
```

Pass the active worksheet database to the workbench metadata/explorer controls. On a target change, reset the target worksheet's `activeDatabase` to null alongside its existing request-id reset. Do not alter `statement` or execution requests.

- [ ] **Step 4: Run workbench tests**

Run: `npx vitest run tests/components/query-workbench.test.tsx`
Expected: PASS.

### Task 3: Controlled schema explorer

**Files:**
- Modify: `components/query/query-schema-browser.tsx`
- Modify: `components/query/query-workbench.tsx`

**Interfaces:**
- `QuerySchemaBrowser` accepts `activeDatabase`, metadata lists, and `revealedObject`.
- `onRevealObject({ database, name, kind })` sets explorer state only.

- [ ] **Step 1: Add controlled explorer props**

```tsx
<QuerySchemaBrowser
  target={activeTarget}
  activeDatabase={activeDatabase}
  revealedObject={revealedObject}
/>
```

- [ ] **Step 2: Render the active database and revealed object**

Render the metadata database/object list scoped to `activeDatabase`, expanding and visibly selecting `revealedObject`; preserve the existing locked placeholder when metadata is unavailable.

- [ ] **Step 3: Verify existing workbench tests**

Run: `npx vitest run tests/components/query-workbench.test.tsx`
Expected: PASS.

### Task 4: Accessible Quick Navigator

**Files:**
- Create: `components/query/query-object-quick-navigator.tsx`
- Modify: `components/query/query-workbench.tsx`
- Modify: `components/query/query-editor-shell.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-CN.json`
- Test: `tests/components/query-object-quick-navigator.test.tsx`

**Interfaces:**
- `QueryObjectQuickNavigator` takes target id, active database, a shared `QuerySchemaStore`, `onDatabaseSelect`, `onRevealObject`, and `onInsertObject`.
- It calls `getSchemaDatabases(targetId, { page: 1, pageSize: 50 })` and `getSchemaObjects(targetId, { database, q, page: 1, pageSize: 50 })` only after opening/search debounce.

- [ ] **Step 1: Write failing navigator tests**

```tsx
fireEvent.keyDown(window, { key: "p", metaKey: true });
expect(screen.getByRole("dialog", { name: "Quick navigator" })).toBeInTheDocument();
fireEvent.keyDown(window, { key: "ArrowDown" });
fireEvent.keyDown(window, { key: "Enter" });
expect(onRevealObject).toHaveBeenCalledWith(expect.objectContaining({ name: "orders" }));
expect(executeQueryTarget).not.toHaveBeenCalled();
```

Include Ctrl+P, non-`/query` rejection, `preventDefault`, tab focus retention, Escape, no-results, retry-after-error, request page-size assertions, no detail request for columns, database selection, and explicit insertion cases.

- [ ] **Step 2: Run failing navigator tests**

Run: `npx vitest run tests/components/query-object-quick-navigator.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the dialog and keyboard model**

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent aria-label={t("navigator.title")} showCloseButton={false}>
    <input autoFocus onKeyDown={handleListKeyDown} />
    <div role="listbox" aria-activedescendant={activeOptionId}>…</div>
  </DialogContent>
</Dialog>
```

Register a `window` keydown listener that opens only for Cmd/Ctrl+P while `pathname === "/query"`, calling `event.preventDefault()`. Abort superseded searches and reject stale result generations. Display columns only by reading ready details from the supplied shared store. Make `Reveal` call only `onRevealObject`; make `Insert` call only `onInsertObject` with the pure helper result.

- [ ] **Step 4: Wire editor insertion and translations**

Pass the existing `EditorView` ref callback from the shell into workbench control wiring and call `replaceEditorSelection` only after explicit Insert. Add exact English and Simplified Chinese strings for title, placeholder, database/table/view/column labels, insert/reveal/retry, loading, empty, and error.

- [ ] **Step 5: Run navigator and workbench tests**

Run: `npx vitest run tests/components/query-workbench.test.tsx tests/components/query-object-quick-navigator.test.tsx tests/lib/query-identifiers.test.ts`
Expected: PASS.

### Task 5: Type-check, inspect, and commit

**Files:**
- Modify: all files from Tasks 1–4 only.

- [ ] **Step 1: Inspect affected execution scope**

Run: GitNexus `detect_changes({ scope: "all" })`.
Expected: only query workbench, schema explorer, quick navigator, identifier helpers, i18n, and their tests are affected.

- [ ] **Step 2: Run required verification**

Run: `npx vitest run tests/components/query-workbench.test.tsx tests/components/query-object-quick-navigator.test.tsx tests/lib/query-identifiers.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/query/query-editor-shell.tsx components/query/query-object-quick-navigator.tsx components/query/query-workbench.tsx components/query/query-schema-browser.tsx lib/query-identifiers.ts messages/en.json messages/zh-CN.json tests/components/query-workbench.test.tsx tests/components/query-object-quick-navigator.test.tsx tests/lib/query-identifiers.test.ts
```
