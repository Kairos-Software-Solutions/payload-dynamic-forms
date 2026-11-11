## Why

The repo's own lockfile carries the advisories listed on 11 November 2026: two critical (`next` 16.3.3, `vitest` 4.0.18), one high (`payload` 3.92.1), moderates (`@payloadcms/next` 3.92.1, `@vitest/mocker` 4.0.18, `esbuild` 0.18.20, `file-type` 20.5.0, `minimatch` 9.0.9 and 10.2.6, `yaml` 2.8.1) and lows (`@eslint/plugin-kit` 0.2.8, `deepmerge` 4.3.1). All of them are development and test dependencies here: the published package has no `dependencies`, only the peer `payload ^3.92.1`. They still run in CI and in the release workflow, which holds npm's publishing trust, so they are fixed. The reviewer also asked for every repo on the latest stable frameworks and tools in one pull request into `main`.

## What Changes

- **Development dependencies to their latest stable versions** (design › Versions): Payload and every `@payloadcms/*` package 3.93.0, Next.js 16.4.6, React 19.3.1, Vitest 5.1.0 with `vite` 8.3.8 now listed (Vitest 5 makes it a peer and Yarn installs no peers), TypeScript 6.0.3, ESLint 9.39.5, and the other direct devDependencies. Held back, with evidence: TypeScript 7 (no compiler API; typescript-eslint supports `<6.1.0`), ESLint 10 (the Payload ESLint config's plugins accept ESLint 9 at most), GraphQL 17 (Payload's peer is `^16.8.1`), `@types/node` 23+ (the package supports Node 22).
- **Transitive fixes through Yarn `resolutions`** where the direct upgrades leave an old version: `esbuild` under `@esbuild-kit/core-utils` (drizzle-kit's loader), `minimatch` 9 and 10 under four tools, and the Payload ESLint config's pinned `eslint`, `@eslint/js`, `typescript-eslint`, `@typescript-eslint/parser` and `typescript`.
- **TypeScript 6 settings** in `tsconfig.json`: `baseUrl` removed (deprecated; the `paths` already start with `./`), `types: ["node"]` (the new default is none), `noUncheckedSideEffectImports: false` (keeps the dev app's CSS imports compiling as before).
- **Tests:** `tests/package.test.ts` checks one exact Payload version inside the peer range instead of the peer floor, and that runtime code needs no peer besides `payload`; new `tests/dependencies.test.ts` checks the lockfile against the advisory list and drizzle-kit's loader on the lifted esbuild; `tests/readme.test.ts` checks the Compatibility line names the tested Payload version.
- **README:** the Compatibility line says the package is tested against Payload 3.93.0; the peer range stays `^3.92.1`.
- **No release.** `version` stays 0.3.0, so the merge runs Release, which finds tag `v0.3.0` and publishes nothing (design 2). The published 0.3.0's peer range already accepts Payload 3.93.0, and it declares no Next.js or React peer.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `package-release`: Payload devDependencies pinned to one version inside the peer range (no longer the floor); the peer range accepts the current stack; the lockfile is clear of the November 2026 advisories; the development toolchain (TypeScript 6, Vitest 5, ESLint 9); the README names the tested Payload version.

## Impact

- Files: `package.json` (devDependencies, new `resolutions`), `yarn.lock`, `tsconfig.json`, `README.md` (one line), `tests/package.test.ts`, `tests/readme.test.ts`, new `tests/dependencies.test.ts`. Possibly lint-only code edits if the newer typescript-eslint reports new errors (design 7).
- No change to `src/`, the published entry points, `peerDependencies`, `engines`, the workflows or the version.
- Apps that use the package: none. 0.3.0 stays the published version; apps upgrade Payload, Next.js and React in their own lockfiles, and 0.3.0 accepts those versions.

## Out of scope

- Publishing a new version, or raising the peer floor to `^3.93.0` (design 2; the reviewer can ask for it).
- Removing the unused template devDependencies (`open`, `sort-package-json`, `qs-esm`, `@swc-node/register`, `@eslint/eslintrc`, `eslint-config-next`): they are bumped, not removed, so the batch changes no setup beyond the upgrades.
- Replacing `@payloadcms/eslint-config` (last published March 2025) with a newer lint setup, which would bring ESLint 10 within reach: a lint change, not an upgrade.
- `deepmerge` 4.3.1: no fixed release exists and Payload 3.93.0 pins it exactly; it stays, listed in design › Advisories.
- Any change to the plugin's behaviour, schema or API.
