# Phase 38V: Frontend Node Runtime Contract

## Purpose

Make the frontend's Node runtime explicit and fail before Next.js starts when
the local runtime drifts from the version used by the release gates.

## Runtime Contract

- The exact supported project runtime is Node `22.22.0`.
- The root `.tool-versions` file is the single checked-in Node version source.
- `.tool-versions` contains exactly:

  ```text
  nodejs 22.22.0
  ```

- No `.nvmrc`, `.node-version`, Volta setting, or other competing version file
  is part of this contract.
- `package.json` declares compatibility with the `22.22.x` line, while the
  dependency-free runtime check enforces the exact `22.22.0` value.
- Node `25.9.0` and every runtime other than `22.22.0` are unsupported, even
  if a command happens to start successfully.

## CI and Local Alignment

Both frontend CI jobs use `actions/setup-node@v4` with
`node-version-file: '.tool-versions'`. They do not provide a competing
`node-version` input. Local asdf selection and CI therefore consume the same
checked-in source of truth.

The `check:runtime` script reads `.tool-versions`, validates its `nodejs`
entry, compares it with `process.versions.node`, prints expected and actual
versions, and exits non-zero on mismatch or invalid configuration. `npm start`,
`npm run dev`, `npm run build`, and `npm run release:local` invoke this check
before Next.js, Turbopack, tests, or other release work begins.

The guard's pure contract evaluator is covered by
`tests/scripts/check-node-runtime.test.ts`. Direct execution alone reads
`.tool-versions` relative to the script and preserves the CLI output and exit
status; importing the module does not run the CLI flow or mutate its exit code.

## Failure and Recovery

An unsupported runtime fails with a controlled diagnostic naming the expected
`22.22.0` version and the actual active Node version. Missing or malformed
`.tool-versions` fails closed with a controlled configuration error rather
than silently accepting the current PATH runtime. A direct start or build under
Node 25 therefore stops at the runtime check and must not reach a Next.js or
Turbopack error.

After selecting the locked runtime, reinstall dependencies to repair any
runtime-specific local artifacts:

```bash
ASDF_NODEJS_VERSION=22.22.0 npm ci
```

Before diagnosing a build failure, run:

```bash
npm run check:runtime
```

## Non-Goals

- No dependency or `package-lock.json` changes.
- No Next.js, font, Turbopack, registry, or build-output workaround.
- No Node upgrade or CI action major-version upgrade.
- No backend, Docker fixture, product behavior, or unrelated WIP changes.

## Automated Regression Coverage

The dependency-free Vitest suite verifies the locked version success path,
expected/actual runtime mismatch diagnostics, missing and malformed
`.tool-versions` configurations, duplicate entries, extra tokens, script-root
resolution from an unrelated current working directory, and side-effect-free
module import. Mismatch cases pass the runtime version as data to the pure
evaluator, so the regression suite does not require Node 25 or any environment
override.

## Acceptance Matrix

| Surface | Node `22.22.0` | Node `25.9.0` / invalid config |
| --- | --- | --- |
| `npm run check:runtime` | Exit 0; print expected and actual `22.22.0` | Non-zero; controlled mismatch/configuration diagnostic |
| `npm start` | Runtime check passes before Next starts | Runtime check fails before Next starts |
| `npm run dev` | Runtime check passes before Next starts | Runtime check fails before Next starts |
| `npm run build` | Build proceeds and passes release validation | `prebuild` fails before Next/Turbopack starts |
| `npm run release:local` | Runtime check is first gate; all local gates pass | Runtime check stops the command before release gates |
| Runtime guard Vitest suite | All contract cases pass without network or version switching | A guard/parser/import regression fails the focused suite |
| CI `release-local` | Setup Node from `.tool-versions`; check passes | CI cannot silently select a competing version |
| CI `release-e2e` | Setup Node from `.tool-versions`; check passes | CI cannot silently select a competing version |
| Dependencies | `npm ci` leaves the lockfile unchanged | No install is attempted by the runtime guard |
