# Databases sheet

Databases console page at `/databases` — filtered inventory (`database_instance` | `database_cluster` | `database_proxy`). The page path goes through the view-model overload that issues typed `GET /resources` requests (not a dedicated backend `/databases` route).

## Sub-features

- `databases-list` — `/databases?environment=prod&page=1` (or `a[href^="/databases"]`) → `h1` (zh `数据库集群与实例` / en `/Database clusters and instances/i`) → `table`.
- `databases-sheet` — sheet `[data-slot="sheet-content"]` (en smoke mentions `Summary`).
- `row-open` — `rows.first().locator("td").nth(2).click()` opens the sheet.
- `env-scoped` — `/databases?environment=prod&page=1`.

## How to get to it (user POV)

- Open Databases in the shell, or `http://localhost:3000/databases`.
- Click the third column cell of the first data row to open the detail sheet.

## Driving it with Playwright

Preconditions: authenticated on `:3000`.

- Prefer `page.goto("/databases?environment=prod&page=1")` (nav hrefs include `?environment=`).
- Assert `table` + `h1` (zh or en).
- Open sheet via `td`.nth(2); evidence `${EVIDENCE_DIR}/databases-list.png`, `${EVIDENCE_DIR}/databases-sheet.png`.

## Gotchas

- Backend has **no** `/databases` path.
- Env slug is `prod` / `staging` / `dev`, not `production`.

## Empty inventory

When there are no database rows, the UI still renders a table with an empty-state row. Prove heading + table first; only open the sheet when a real data row exists. Do not treat empty seed as a failed list proof.
