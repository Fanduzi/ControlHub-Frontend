# Phase 38N: Governed Explain And Query Risk Presentation — Evidence

Date: 2026-07-21.

## Endpoint And Safety Boundary

One governed endpoint was added under the existing fresh-actor, target-scoped
query boundary:

```text
POST /query-targets/{id}/explain
```

The handler accepts only `statement`, resolves actor and target policy from
authenticated context, and returns a backend-normalized Explain response. It
never executes the bare `SELECT`, accepts browser-supplied `EXPLAIN` syntax,
returns raw plan text, or writes a `query_executions` result-history row.

Safety boundary: same governed target access resolution, credential binding,
timeout, and query safety rules as the existing execute route.

## Engine Decision

- MySQL v1 normalized Explain is supported.
- TiDB advertises `explain=false` in target capability; direct endpoint calls
  return controlled unsupported error (HTTP 409).
- The direct 409 behavior is contract-tested. No ready TiDB target existed to
  prove the runtime engine gate end-to-end.

## Fixture Repair

`query_e2e.qe_explain_big` was added as a deterministic, idempotent E2E fixture
table. It exists solely to support the approved governed Explain acceptance
statement. It produces the normalized MySQL `full_table_scan` risk.

The fixture does not change grants, credentials, DSN format, SQL guard,
OpenAPI, or product data model. It uses `CREATE TABLE IF NOT EXISTS` and
`INSERT IGNORE` for idempotency.

Backend fixture repair SHA: `9a8cf1dfb19f745076c3bfe47afa5f35d2b8861c`.

## Gate And E2E Evidence

- Backend explain delivery: `9ce2dd91ca35d2c0981574d8f99bd3571267fe1e`.
  CI: [run 29750525937](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/29750525937),
  conclusion: success.
- Backend fixture repair: `9a8cf1dfb19f745076c3bfe47afa5f35d2b8861c`.
  CI: [run 29807643409](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/29807643409),
  conclusion: success.
- Frontend delivery: `b593ad0f0aa264998158104f7982471acf82da55`.
  CI: [run 29750997509](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/29750997509),
  conclusion: success.
- Real merged-root E2E: 74 passed, 0 failed, 0 skipped.

## Negative Scope Confirmation

No application code, tests, fixture scripts, OpenAPI, migrations, dependencies,
credentials, `.env`, local services, Docker, or Git configuration was modified
as part of this documentation closure.

The following were explicitly preserved:
- Frontend worktree `phase-38h-query-workbench-scalable-ia-reset`.
- Frontend WIP branch `wip/query-runtime-fixes-2026-07-20`.
- Backend user changes `.gitignore` and `advisor-plans/README.md`.

## Remaining Findings

None P1/P2.
