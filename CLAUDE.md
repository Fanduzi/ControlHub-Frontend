# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack) on :3000
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit/component tests
npx vitest run tests/lib/view-models.test.ts   # Single test file
npm run test:e2e     # Playwright E2E tests (requires backend on :8080)
```

## Architecture

**Next.js 16 App Router** + TypeScript strict + Tailwind v4 + shadcn `base-nova`.

### Data Flow

```
Backend API (:8080)
  → services/*.ts          (typed fetch via api-client.ts, auth from sessionStorage)
  → lib/view-models.ts     (transforms wire types → view models with joined lookups)
  → Page components        (server components call view-model functions directly)
  → Feature components     (client components consume view-model props)
```

Server components in `app/(console)/*/page.tsx` call view-model functions which internally fetch from the API and transform data. Client components (tables, sheets, forms) receive pre-built view models as props.

### Route Structure

- `app/login/` — standalone auth page
- `app/(console)/` — route group with shared `AppShell` layout (sidebar + topbar)
- All console pages are server components that call `listXxxViewModels()` from `lib/view-models.ts`

### Provider Stack

`AppProviders` wraps the console: `NextIntlClientProvider` → `ThemeProvider` → `AccentProvider` → `EnvironmentProvider` → `TooltipProvider`.

### Detail Sheet Pattern

Table rows set `selectedResource` state → renders `ResourceDetailSheetLoader` which lazy-fetches profile/relations/audits → displays in a shadcn `Sheet` (right-side panel). Used identically on `/resources` and `/databases`.

## Key Conventions

- **Default locale is `zh-CN`**, not English. Locale set via `controlhub.locale` cookie. All user-facing strings live in `messages/{zh-CN,en}.json`.
- **Auth tokens in `sessionStorage`** (`controlhub.token`, `controlhub.role`). No middleware guards — client-side redirect only.
- **API responses**: `{ items: T[] }` for lists, camelCase fields. 404 returns `null` from service functions.
- **Tailwind v4** uses inline `@theme` in `globals.css`, not `tailwind.config.ts` (which is mostly empty).
- **shadcn components** use `@base-ui/react` under the hood, not Radix. Use `data-slot` attributes for test selectors.
- **Colors**: OKLCH color space in CSS variables. Accent system (blue/purple/emerald/amber) via `data-accent` attribute.

## Environment

- `NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:8080`
- Backend repo: `/Users/fan/GolangProjects/ControlHub`
- Seeded login: `admin@example.com` / `secret123`

## Testing

- **Unit tests** in `tests/` with Vitest + jsdom + testing-library. Mock service functions with `vi.mock()`, wrap renders in `NextIntlClientProvider`.
- **E2E tests** in `e2e/` with Playwright (chromium only). **Always use `loginViaUI()` for SSR console pages** — it navigates through the real login form and establishes a client-side session. `loginViaApi()` only sets `sessionStorage` (client-only), which breaks SSR auth because server components fetch during render with no token. Tests set English locale cookie.
- Vitest excludes `e2e/**` — the two runners must not cross paths.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ControlHub** (349 symbols, 902 relationships, 24 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/ControlHub/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ControlHub/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ControlHub/clusters` | All functional areas |
| `gitnexus://repo/ControlHub/processes` | All execution flows |
| `gitnexus://repo/ControlHub/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->