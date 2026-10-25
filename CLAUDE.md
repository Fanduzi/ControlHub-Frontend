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
- **Authentication** uses a same-origin Console BFF. Browser JavaScript stores only presentation role state (`controlhub.role`); the Backend Bearer Credential stays in the HttpOnly Operator Session cookie. Protected pages require the sealed session through `proxy.ts`.
- **API responses**: `{ items: T[] }` for lists, camelCase fields. 404 returns `null` from service functions.
- **Tailwind v4** uses inline `@theme` in `globals.css`, not `tailwind.config.ts` (which is mostly empty).
- **shadcn components** use `@base-ui/react` under the hood, not Radix. Use `data-slot` attributes for test selectors.
- **Colors**: OKLCH color space in CSS variables. Accent system (blue/purple/emerald/amber) via `data-accent` attribute.
- **Documentation**: L3 file headers (`input:`, `output:`, `pos:`, `note:`) are retired. Do not add them to source files. Module `README.md` files (L2) and the root architecture map (L1) remain in use.

## Environment

- `CONTROLHUB_API_BASE_URL` defaults to `http://localhost:8080` for server-side BFF calls
- Backend repo: `/Users/fan/GolangProjects/ControlHub`
- E2E operator identities come only from explicit per-run fixture provisioning
  (`E2E_FIXTURE_ADMIN_*` / `E2E_FIXTURE_EDITOR_*` env via the backend
  `cmd/e2e-fixture-bootstrap` seam, gated by `CONTROLHUB_E2E_FIXTURE_MODE=1`
  and a dedicated disposable `*_e2e` metadata DSN). The 0002 seed accounts
  (`admin@example.com` / `editor@example.com` / `secret123`) were retired by
  backend migration 00016 and are refused, never used.
- **Fixture seam**: the backend `cmd/e2e-fixture-bootstrap` seam is on backend
  `main` (shipped as ticket #19). Frontend CI already calls it.

## Testing

- **Unit tests** in `tests/` with Vitest + jsdom + testing-library. Mock service functions with `vi.mock()`, wrap renders in `NextIntlClientProvider`.
- **E2E tests** in `e2e/` with Playwright (chromium only). **Always use `loginViaUI()` for SSR console pages** — it navigates through the real login form with the provisioned fixture identity and establishes a client-side session. Tests set English locale cookie.
- Vitest excludes `e2e/**` — the two runners must not cross paths.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ControlHub-Frontend** (8394 symbols, 18411 relationships, 697 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/ControlHub-Frontend/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ControlHub-Frontend/clusters` | All functional areas |
| `gitnexus://repo/ControlHub-Frontend/processes` | All execution flows |
| `gitnexus://repo/ControlHub-Frontend/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
