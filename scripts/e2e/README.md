# scripts/e2e

`clickhouse-preview.mjs` is launched by the companion backend's `TestClickHousePreviewHTTP` when `CONTROLHUB_CH_BROWSER_CHECKOUT` points to this checkout. It opens a real Chromium session against an isolated Next.js/BFF instance and checks developer-authored SQL in the shared editor (edit, rerun, half-open date ranges, grouped counts, 5/5/2 page navigation with live policy revocation, nested policy refusals and history), disclosure, column reselection, exact UInt64 display and UTC daily counts.

Disposable PostgreSQL E2E fixture scripts.

| Script | Purpose |
|--------|---------|
| `pg-fixture-lib.sh` | Shared primitives used by the lifecycle scripts |
| `pg-fixture-up.sh` | Brings up the disposable PG fixture: builds the e2e server from the exact pinned backend SHA/tree (requires a clean exact SHA/tree plus a VCS-stamped binary — `vcs.revision` equal to the pin and `vcs.modified` not true; use a real clone when linked-worktree builds lack the stamp), then launches the listener with `CONTROLHUB_E2E_FIXTURE_MODE=1` and `CONTROLHUB_PG_HTTP_ENTRIES=on` so the governed PostgreSQL HTTP entries (execution, read model, Explain) are exposed for this run only — production defaults stay off |
| `pg-fixture-down.sh` | Tears down the fixture run |
| `pg-fixture-evidence.sh` | Collects run evidence |
