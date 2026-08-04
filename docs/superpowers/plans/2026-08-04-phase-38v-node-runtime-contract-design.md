# Phase 38V: Frontend Node Runtime Contract Design

## Decision

Pin the ControlHub frontend to Node `22.22.0` using one checked-in source of
truth: the root `.tool-versions` file with the exact content `nodejs 22.22.0`.
Local asdf and both frontend CI jobs consume that file. `package.json` also
declares `22.22.x` compatibility so package-manager diagnostics agree with
the project contract, but package-manager engine policy is not the fail-fast
mechanism.

## Runtime Guard

Add `scripts/check-node-runtime.mjs` as a dependency-free Node script. It
resolves `.tool-versions` relative to the script location, reads and validates
the `nodejs` entry, compares the configured exact version to
`process.versions.node`, prints expected and actual versions, and exits
non-zero for a mismatch. Missing, malformed, duplicate, or unsupported
configuration fails closed with a controlled configuration error. The guard
does not install packages, mutate files, use the network, or bypass a failing
command.

Expose the guard as `check:runtime`. `prestart`, `predev`, and `prebuild`
protect direct developer commands through npm lifecycle hooks. `release:local` calls
`npm run check:runtime` as its first command, before E2E preflight, typecheck,
lint, tests, or build.

## CI Wiring

Keep the existing checkout order, cache behavior, secrets, backend checkout,
Go setup, and action versions unchanged. In both `release-local` and
`release-e2e`, keep `actions/setup-node@v4`, replace the broad `node-version`
literal with `node-version-file: '.tool-versions'`, and report `node --version`
plus `npm run check:runtime` immediately after Node setup and before install or
build work.

## Documentation and Recovery

README setup instructions name the exact runtime, show asdf selection, point to
`.tool-versions` as the source of truth, require `npm ci` after changing Node,
and recommend `npm run check:runtime` before diagnosing build failures. The
safe recovery command is:

```bash
ASDF_NODEJS_VERSION=22.22.0 npm ci
```

This design does not add `.nvmrc`, `.node-version`, Volta configuration, a
dependency, lockfile changes, or any Next/font/Turbopack workaround.

## Test-First Acceptance

The runtime guard is exercised through CLI checks rather than a new test file,
because the Phase 38V allowed-file list contains no runtime test file.

| Check | Expected result |
| --- | --- |
| Node `25.9.0` plus `npm run check:runtime` | Non-zero controlled message includes expected `22.22.0` and actual `25.9.0` |
| Missing `.tool-versions` | Non-zero controlled configuration error; no PATH fallback |
| Malformed `.tool-versions` | Non-zero controlled configuration error; no silent acceptance |
| Node `25.9.0` plus `npm start` | `prestart` stops the command before Next/Turbopack output |
| Node `25.9.0` plus `npm run build` | `prebuild` stops the command before Next/Turbopack output |
| Node `22.22.0` plus `npm run check:runtime` | Exit 0 and report both versions |
| Node `22.22.0` plus `npm ci` | Exit 0 with no `package-lock.json` diff |
| Supported local release gates | Typecheck, lint, tests, build, and `release:local` pass |
| Supported release E2E | Zero failed and zero skipped required tests |
| CI workflow inspection | Both setup-node steps use `.tool-versions` and neither uses `node-version` |

## Verification Order

1. Confirm the clean isolated worktree starts at the exact `origin/main` base.
2. Write and diff-check this design and the runtime specification.
3. Add the smallest allowed runtime guard slice and capture controlled RED
   failures for drift, invalid configuration, and prestart/prebuild ordering.
4. Add the exact version source, package scripts, engine declaration, README
   guidance, and CI wiring.
5. Run all Node `22.22.0` gates, then run only the Node 25 fast-fail probes.
6. Run the release E2E suite against isolated candidate services and record
   service provenance and cleanup.
7. Run GitNexus change detection before each focused conventional commit and
   manually verify scope if the index is unavailable.

## Stop Conditions

Stop and report if setup-node cannot consume `.tool-versions`, Node `22.22.0`
cannot install the existing lockfile or pass the current gates, asdf cannot
resolve the locked runtime, any required correction needs a dependency or
lockfile change, a supported gate fails twice after focused correction, or any
file outside the allowed implementation list changes.
