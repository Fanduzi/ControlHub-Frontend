# Query workbench

Operator query workbench at `/query`: connections affordance, editor, run control, results. Full execute proof often needs BE `make run-query-dev` (Docker query-e2e MySQL on `:13306`).

## Sub-features

- `nav-query` — `page.goto("/query")` or `a[href^="/query"]` (shell links may be `/query?environment=prod`).
- `connections` — button matching `/Open connections|打开连接|连接/i`.
- `editor-run` — editor `.cm-content` (may be absent until a target/workspace is ready); run `/^run$/i`; results `getByRole("grid")`.
- `history` — tab `/query history|查询历史/i` when present.
- `execute` — **verified-unreachable** without query-dev / query-e2e fixture; prove shell reachability only.

## How to get to it (user POV)

- Open Query in the shell, or go to `http://localhost:3000/query`.
- Open connections, pick a target when provisioned, edit SQL, Run.

## Driving it with Playwright

Preconditions: authenticated on `:3000`. For execute/results, seed query targets (BE query-dev). If fixtures missing, prove URL `/query` + connections button (and editor if present); record execute as `verified-unreachable` with unmet precondition.

- Evidence: `${EVIDENCE_DIR}/query-shell.png` + `${EVIDENCE_DIR}/query-shell.txt` (counts / URL).
- Do not claim execute PASS without a ready target.

## Gotchas

- Query E2E MySQL (`:13306`) is separate from metadata MySQL `:3318`.
- Empty connections is not automatically a console bug when fixtures were never seeded.
- English ARIA names in E2E assume `controlhub.locale=en`; default QA console is zh-CN.
