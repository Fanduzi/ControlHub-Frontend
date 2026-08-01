# Phase 38U: Design Document

> **Status**: Design  
> **Date**: 2026-08-01

## State Model

### Raw Draft vs. Committed Value

```
User types → maxRowsDraft (local string, always visible)
                    ↓
          isValidMaxRowsString(draft)?
          ├─ true  → onMaxRowsChange(parsed) → parent commits, persists, resets page, rotates requestId
          └─ false → no parent call, error shown, Run disabled
```

- `maxRowsDraft`: local `string` state in `ReadyWorksheet`. Always reflects exactly what the user typed.
- Committed value: `activeWorksheet.maxRows` (number, `1..500`). Only updated by the parent's `onMaxRowsChange` handler.
- Draft validity is derived from the raw string, never from a coerced number.

### Draft Parser/Validator

A new exported function in `lib/query-editor-preferences.ts`:

```typescript
export type MaxRowsDraftResult =
  | { valid: true; value: number }
  | { valid: false };

export function parseMaxRowsDraft(raw: string): MaxRowsDraftResult;
```

- Accepts the raw string from `event.target.value`.
- Trims whitespace.
- Returns `{ valid: true, value }` for finite integers in `1..500`.
- Returns `{ valid: false }` for everything else (empty, fractional, non-numeric, zero, negative, `>500`).
- Does **not** write storage or choose a fallback.

### canRun Derivation

```typescript
const draftResult = parseMaxRowsDraft(maxRowsDraft);
const canRun = runEnabled && draftResult.valid;
```

- `canRun` gates both the toolbar Run button and the `SqlCodeEditor` `onRun` callback.
- `SqlCodeEditor` receives `onRun={canRun ? onRun : undefined}` — passing `undefined` disables the keyboard shortcut.

### Error Rendering

```tsx
{!draftResult.valid && (
  <p id="max-rows-range-error" role="alert" className="text-xs text-rose-600">
    {t("editor.maxRowsRangeError")}
  </p>
)}
```

Input attributes:
```tsx
<Input
  aria-invalid={!draftResult.valid || undefined}
  aria-describedby={!draftResult.valid ? "max-rows-range-error" : undefined}
  ...
/>
```

## Accessibility

- `aria-invalid="true"` on the input when draft is invalid — signals validation error to assistive tech.
- `aria-describedby` links the input to the error message — screen readers announce the range guidance.
- `role="alert"` on the error element — immediate announcement when error appears.
- Run button uses existing `disabled` prop — standard button disable pattern.
- Keyboard shortcut gated by `onRun` being `undefined` — same as existing disabled behavior.

## Localization

- Two new translation keys at `queryWorkbench.editor.maxRowsRangeError`.
- EN and zh-CN must be identical key sets.
- No missing-message console errors.

## Test Design

### Preference Tests (`tests/lib/query-editor-preferences.test.ts`)

- `parseMaxRowsDraft` returns valid for `"1"`, `"100"`, `"500"`.
- `parseMaxRowsDraft` returns invalid for `""`, `"0"`, `"-1"`, `"2.5"`, `"501"`, `"abc"`, `" 50 "`, `"Infinity"`.
- Existing `normalizeMaxRows` tests retained — they cover the persisted-value boundary.

### Component Tests (`tests/components/query-editor-shell.test.tsx`)

Replace the three Phase 38T tests that permitted invalid drafts to execute:

1. **Empty draft**: error shown, `aria-invalid`, Run disabled, zero execute calls from button and keyboard.
2. **`501`**: visible, error shown, no persistence, no execution, no page/request-id reset.
3. **Correction to valid**: persists, clears error, resets to page 1, invalidates stale response.
4. **Fractional/zero/invalid text**: same non-executable behavior.
5. **Valid boundaries `1` and `500`**: executable.
6. **Worksheet switching**: drops stale invalid draft, shows destination committed value.

### E2E (`e2e/query-workbench.spec.ts`)

One scenario:
1. Run a safe SELECT.
2. Enter invalid maxRows.
3. Assert visible validation and zero additional governed execute requests.
4. Correct to valid value and run.
5. Assert real `POST /query-targets/{id}/execute` carries the exact valid `maxRows` and page-1 pagination.

### Test Harness (`tests/setup.ts`)

The Phase 38U candidate requires the conditional `localStorage` shim because
the targeted jsdom environment can expose `globalThis.localStorage` without a
usable `getItem` method. Removing it produced `16 passed, 60 failed` in the
focused suite, including `window.localStorage.getItem is not a function` from
existing query tests. This is a test-environment dependency only; no runtime
storage behavior changes.

The shim installs only when the native object is unusable and the global
Vitest `beforeEach` clears storage before every test. The focused isolation
regression writes a max-rows sentinel in one test and verifies the next test
starts without it, defining the no-leak contract for this global setup.

## Implementation Sequence

1. Add `parseMaxRowsDraft` to `lib/query-editor-preferences.ts` and its unit tests.
2. Add EN/zh-CN translation keys.
3. Update `ReadyWorksheet` in `query-editor-shell.tsx`:
   - Derive `draftResult` from `parseMaxRowsDraft(maxRowsDraft)`.
   - Gate `onMaxRowsChange` call on `draftResult.valid`.
   - Derive `canRun` from `runEnabled && draftResult.valid`.
   - Pass `onRun={canRun ? onRun : undefined}` to `SqlCodeEditor`.
   - Render inline error with `role="alert"`, `id`, `aria-describedby`.
   - Add `aria-invalid` and `aria-describedby` to the Input.
4. Replace old tests with new validation tests.
5. Add E2E scenario.
6. Retain the documented conditional test-harness shim and its isolation regression.
