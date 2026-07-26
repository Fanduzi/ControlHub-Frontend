# Phase 38Q Disclosure Hardening - Oracle Frontend Review

## Review Details
- **Reviewer**: Oracle
- **Date**: 2026-07-26
- **Scope**: Frontend changes for Phase 38Q disclosure hardening repair
- **Base SHA**: ae3734b
- **Candidate HEAD**: 9d3bebf

## Findings

### P1 (Fixed)
1. **masked values are not validated before display**
   - **Issue**: `normalizeExecuteResponse` validates mode, copy consistency, and row width, but never checks that each non-null cell of a `masked_no_copy` column equals `[MASKED]`
   - **Fix**: Added validation to check that non-null cells in `masked_no_copy` columns equal `[MASKED]` sentinel
   - **Status**: Fixed in commit 9d3bebf

### P2 (Fixed)
2. **`copyAllowed` is checked by truthiness, not as an exact boolean**
   - **Issue**: A JSON payload such as `"false"` is accepted for `raw_copy_allowed`, despite violating the wire contract
   - **Fix**: Added `typeof copyAllowed === "boolean"` check and exact equality with the mode's required value
   - **Status**: Fixed in commit 9d3bebf

## What Looks Correct

- `normalizeExecuteResponse` now validates all disclosure contracts including mode, copyAllowed consistency, row width, and masked sentinel
- `ExecuteErrorPanel` correctly omits `error.message` for `query_result_disclosure_blocked`
- The settings route is staged and no longer ignored
- The new validation is linear in columns and rows, with no meaningful performance concern

## Validation
- `tsc --noEmit`: passed
- `npm run lint`: passed (0 errors, 5 warnings unrelated to changes)
- `npm run test`: passed, 1,214 tests
- `npm run build`: passed

## Verdict
**PASS** - All P1/P2 findings have been addressed. The changes are ready for merge.
