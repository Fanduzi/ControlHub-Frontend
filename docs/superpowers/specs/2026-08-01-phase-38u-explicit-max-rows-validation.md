# Phase 38U: Explicit Max-Rows Validation

> **Status**: Spec  
> **Date**: 2026-08-01  
> **Depends on**: Phase 38T (`f28d67f` frontend, `d776709` backend)

## Why This Matters

Phase 38T prevents invalid max-row values from reaching worksheet state, local storage, and the governed execute endpoint. Its current UI, however, leaves an invalid raw number such as `501` visible while a previous valid prefix such as `50` remains the actual execution value. The Run button and editor shortcut still execute that hidden committed value, which is safe but misleading. This phase makes the distinction observable and prevents execution until the displayed value is valid.

## Locked Behavior

### Valid Range

- Valid `maxRows` is an integer in `1..500`.
- Default is `100`.
- No backend changes. No storage-key migration.

### Raw Draft vs. Committed Value

- The number input remains a **raw draft** so clearing and retyping does not force a surprise value.
- A draft is committed to worksheet state and `controlhub.query.max-rows` **only** when it is a valid integer in `1..500`.
- Invalid drafts **never** replace the last committed valid `maxRows`.

### Invalid Draft Behavior

When the visible draft is invalid (empty, fractional, zero, negative, non-numeric text, or `>500`):

1. Show one localized inline range error: "Enter a value between 1 and 500" (EN) / "请输入 1 到 500 之间的值" (zh-CN).
2. Mark the input `aria-invalid="true"`.
3. Link the error via `aria-describedby`.
4. Expose `role="alert"` on the error element.
5. **Disable** both the toolbar Run button **and** the SQL editor keyboard Run shortcut (`Cmd/Ctrl+Enter`).
6. **Zero** `/execute` requests — neither button click nor keyboard shortcut may fire an execute.
7. Do **not** clamp, rewrite, or silently normalize the visible invalid draft while typing.

### Valid Draft Behavior

When the draft is corrected to a valid integer:

1. Commit immediately to worksheet state.
2. Persist to `controlhub.query.max-rows` local storage.
3. Reset pagination to page 1 (`currentPage: 1`).
4. Clear `resultPagination`.
5. Rotate `requestId` so old in-flight responses cannot render.
6. Clear the inline error.
7. Re-enable both Run paths.

### Worksheet Switching

- Switching worksheets resynchronizes the input to that worksheet's committed valid value.
- Invalid drafts are **never** shared across worksheets or persisted.
- Returning to a worksheet with an invalid draft never imports the stale invalid draft.

### Accessibility

- `aria-invalid="true"` on the input when draft is invalid.
- `aria-describedby` pointing to the error element's stable ID.
- `role="alert"` on the error element for screen reader announcement.
- Run button and keyboard shortcut both disabled — no partial gating.

## EN/zh-CN Requirements

| Key | EN | zh-CN |
|-----|----|-------|
| `queryWorkbench.editor.maxRowsRangeError` | Enter a value between 1 and 500 | 请输入 1 到 500 之间的值 |

Both locales must contain the key. Missing keys must not produce console errors.

## Execution Invariants

1. The visible draft and the committed execution cap can never disagree silently.
2. An invalid visible draft always has an inline error and blocks Run.
3. Toolbar and keyboard Run cannot invoke `executeQueryTarget` while the draft is invalid.
4. Only finite integers in `1..500` reach worksheet `maxRows`, local storage, or an execute request.
5. Correcting to a valid value preserves Phase 38S/38T page reset and request-id invalidation behavior.

## Acceptance Matrix

| # | Draft | Input visible? | Error visible? | Run enabled? | Execute fires? | Persisted? | Page reset? |
|---|-------|---------------|----------------|-------------|----------------|------------|-------------|
| 1 | empty (`""`) | yes (empty) | yes | no | no | no | no |
| 2 | `501` | yes (`501`) | yes | no | no | no | no |
| 3 | `2.5` | yes (`2.5`) | yes | no | no | no | no |
| 4 | `0` | yes (`0`) | yes | no | no | no | no |
| 5 | `-1` | yes (`-1`) | yes | no | no | no | no |
| 6 | `abc` | yes (`abc`) | yes | no | no | no | no |
| 7 | `1` | yes (`1`) | no | yes | yes | yes | yes |
| 8 | `500` | yes (`500`) | no | yes | yes | yes | yes |
| 9 | `100` | yes (`100`) | no | yes | yes | yes | yes |
| 10 | `501` → `100` | shows `100` | no | yes | yes | yes | yes |
| 11 | worksheet switch with invalid draft | destination value | no | yes | yes | yes | no |

## Non-Goals (Explicit)

- No API, backend, database, SQL guard, disclosure, execution-history, audit, paging response, saved-statement, or preference-key change.
- No clamping or rewriting of invalid user input during typing.
- No global validation state, second worksheet store, debounce, toast, or browser SQL parsing.
- No new API field.
- No changes to unrelated E2E suites.

## Approved Test-Harness Dependency

`tests/setup.ts` remains explicitly approved Phase 38U scope because this
candidate's jsdom environment exposes `globalThis.localStorage` without a
usable `getItem` method during the targeted component suite. Removing the
conditional shim produced a focused RED result (`16 passed, 60 failed`) with
`window.localStorage.getItem is not a function` in existing query tests. The
shim is therefore required by the current test environment, not by product
runtime behavior.

The harness contract is deliberately narrow:

- Install the Map-backed Storage implementation only when jsdom does not
  expose a usable `localStorage.getItem` function.
- Clear `localStorage` in the global Vitest `beforeEach`, so one test cannot
  inherit preference state from another test or test file in the same worker.
- Keep production storage behavior and storage keys unchanged.
- The paired `Phase 38U: localStorage harness isolation` tests write a sentinel
  in one test and require it to be absent in the next test.

## Done Criteria

- [ ] The visible draft and committed execution cap can never disagree silently.
- [ ] Toolbar and keyboard Run cannot invoke `executeQueryTarget` while the draft is invalid.
- [ ] Only finite integers in `1..500` reach worksheet `maxRows`, local storage, or an execute request.
- [ ] Correcting to a valid value preserves Phase 38S/38T page reset and request-id invalidation behavior.
- [ ] EN and zh-CN messages are complete and accessible names/errors are covered.
- [ ] Targeted tests, full gates, and the focused real-browser scenario pass with no skips.
- [ ] `tests/setup.ts` is retained only for the documented jsdom dependency and isolation contract; no other file outside Scope changes.
- [ ] No backend behavior or product contract changes.
