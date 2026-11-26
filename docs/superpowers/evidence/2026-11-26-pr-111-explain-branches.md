# Worksheet Explain branch controls: PR 111

[Frontend PR 111](https://github.com/Fanduzi/ControlHub-Frontend/pull/111) delivers [issue 173](https://github.com/Fanduzi/ControlHub-Backend/issues/173), the branch expand/collapse slice of [roadmap item 32](https://github.com/Fanduzi/ControlHub-Backend/issues/171). Cards start expanded; a keyboard- and mouse-operable branch control hides only descendants, without a request. Text always includes the complete delivered plan. New plans start expanded. Risks, fields, focus behavior and disclosure are unchanged. Collapse choices are not guaranteed to persist across worksheet switches.

## Reviewed refs

| Ref | SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `3cf15e7a3e44cc333f3935c91b12beb942b2fde7` |
| Reviewed candidate and isolated fast-forward product commit | `33cab84823aedb3a98b0994bafefe113b2f3adcb` |
| Reviewed product tree | `873e195c50bbb4c6cc417db6394bd706fb2b30d1` |
| PR CI merge checkout, same tree | `41f18abea33ff1b32c396e3ccf77db8934022b4c` |
| Unchanged backend `origin/main` and E2E pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only 33cab84823aedb3a98b0994bafefe113b2f3adcb` advanced the isolated delivery checkout from the base. The `git push origin HEAD:refs/heads/main` range starts at that base and ends at the documentation-only commit carrying this record.

## Review and verified gates

- Independent Pi `reviewer` Standards: **OK**. Independent Spec re-review: **OK — Ship**, P1 **0**, P2 **0**. The re-review dismissed the initial ordering and identity blockers after checking pinned backend parent-first traversal and the frontend's fresh JSON decoding for every Explain POST. Cross-worksheet persistence is not part of issue 173.
- Candidate: targeted Explain component suite 15 passed; `git diff --check` and `check_three_level_doc.sh --staged` passed on the complete product diff (three L2 modules updated, no L1 architecture change).
- Isolated checkout `/private/tmp/controlhub-pr111-close.GU0kQL/main` at the product SHA: Node 22.22.0, `npm ci`, then `CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed. TypeScript, governance and contract checks, 143 Vitest files / 2,225 tests and Next build passed. ESLint had the existing `audit-table.tsx` warning only.
- `npm run test:e2e -- e2e/query-workbench.spec.ts e2e/explain-branch-local-probe.spec.ts -g 'Explain shows normalized risk|PostgreSQL Explain renders bounded nodes'` passed **2, failed 0, skipped 0** in that checkout. The temporary PG spec used the committed browser assertions with the existing port-aware paired harness because the unchanged full PG suite expects `:8080`. MySQL verified leaf/risk/focus; PostgreSQL verified keyboard collapse, pointer expand, focus and complete text. Next `:3100` and proxy `:8081` CWDs were the isolated checkout at the product SHA. `/e2e/assembly` confirmed `c171-delivery` and the backend pin on `:18082` (PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`). The temporary spec was removed after the run.
- [PR CI 45652909733](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45652909733) passed `release-local` (139341818240): 143 files / 2,225 tests and build; and `release-e2e` (139341820276): cross-engine worksheet checks and `npm run release:e2e`, **230 Chromium tests passed, 0 failed, 0 skipped**. Both used the PR merge tree above and the pinned backend; E2E used its disposable CI listener on `:8080` and the unmodified fixture guards. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45652909733/artifacts/15042292735).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` kept exactly its 22 pre-existing porcelain entries, including `advisor-plans/README.md` and 21 untracked entries; exact whitelist SHA-256 `048bd702c95c3ed5c3673fef638b2438b1d7025dd692e59823a54715d9864cbf`. No backend push or change. Existing listeners `:8080` (PID 69999) and `:18082` were preserved. Playwright cleaned up only its own listeners. The document-check checkout and temporary probe were removed; delivery and implementation checkouts and the PR branch were retained for verification.
