# Resources inventory

Unified resource inventory at `/resources` with dense table, right-side detail sheet (`[data-slot="sheet-content"]`), and full detail page `/resources/[id]`.

## Sub-features

- `inventory-list` — open `/resources?environment=prod&page=1` (or nav `a[href^="/resources"]`) → `h1` (zh `统一资源清单` / en `/Unified resource inventory/i`) → `table`.
- `detail-sheet` — sheet root `[data-slot="sheet-content"]` (copy locale-dependent; en smoke mentions `Operational profile`).
- `detail-page` — row link `table tbody tr td a` → URL `/\/resources\/\d+/`.
- `env-scoped-list` — `/resources?environment=prod&page=1`.

## How to get to it (user POV)

- From the console shell, click Resources, or open `http://localhost:3000/resources`.
- Click a row link for the full detail page.

## Driving it with Playwright

Preconditions: authenticated on `:3000`; BE inventory data available.

- Prefer `page.goto("/resources?environment=prod&page=1")` — sidebar hrefs are `/resources?environment=prod`, so exact `a[href="/resources"]` times out on the default shell.
- Assert `table` + `h1` (zh or en).
- Detail: `page.locator("table tbody tr td a").first().click()` → `/\/resources\/\d+/`.
- Evidence: `${EVIDENCE_DIR}/resources-list.png`, `${EVIDENCE_DIR}/resources-detail-url.txt`.

## Gotchas

- Empty table may mean missing seed or wrong environment filter.
- Do not confuse `/cmdb` bookmark with the inventory itself.
- Parallel Playwright workers are disabled (`workers: 1`).
