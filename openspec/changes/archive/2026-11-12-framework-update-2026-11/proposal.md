## Why

The repo's own lockfile carries the advisories listed on 11 November 2026: two critical (`next` 16.3.3, `vitest` 4.0.18), one high (`payload` 3.92.1), moderates (`@payloadcms/next` 3.92.1, `@vitest/mocker` 4.0.18, `esbuild` 0.18.20, `file-type` 20.5.0, `minimatch` 9.0.9 and 10.2.6, `yaml` 2.8.1) and lows (`@eslint/plugin-kit` 0.2.8, `deepmerge` 4.3.1). The list was read from the 0.3.0 lockfile; the 0.5.0 lockfile this change builds on still resolves every one of those versions (re-read 12 Nov) and adds no other advisory. All of them are development and test dependencies here: the published package has no `dependencies`, only the peers `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`. They still run in CI and in the release workflow, which holds npm's publishing trust, so they are fixed. The reviewer also asked for every repo on the latest stable frameworks and tools in one pull request into `main`.

## What Changes

- **Development dependencies to their latest stable versions** (design › Versions): Payload and every `@payloadcms/*` package 3.93.0, Next.js 16.4.6, React 19.3.1, Vitest 5.1.0 with `vite` 8.3.8 now listed (Vitest 5 makes it a peer and Yarn installs no peers), TypeScript 6.0.3, ESLint 9.39.5, OpenSpec 1.17.0, and the other direct devDependencies. `@testing-library/dom` 10.4.2, `@testing-library/react` 16.3.3 and `jsdom` 31.0.0 (added in 0.4.0) are already the latest. Held back, with evidence: TypeScript 7 (no compiler API; typescript-eslint supports `<6.1.0`), ESLint 10 (the Payload ESLint config's plugins accept ESLint 9 at most), GraphQL 17 (Payload's peer is `^16.8.1`), `@types/node` 23+ (the package supports Node 22), OpenSpec 2.0.0 and Prettier 3.10.1 (under a day old at 12 Nov 16:00 UTC, so Yarn's age gate refuses them; design 10).
- **Transitive fixes through Yarn `resolutions`** where the direct upgrades leave an old version: `esbuild` under `@esbuild-kit/core-utils` (drizzle-kit's loader), `minimatch` 9 and 10 under four tools, and the Payload ESLint config's pinned `eslint`, `@eslint/js`, `typescript-eslint`, `@typescript-eslint/parser` and `typescript`.
- **TypeScript 6 settings** in `tsconfig.json`: `baseUrl` removed (deprecated; the `paths` already start with `./`), `types: ["node"]` (the new default is none), `noUncheckedSideEffectImports: false` (keeps the dev app's CSS imports compiling as before).
- **Tests:** `tests/package.test.ts` checks one exact Payload version inside the `payload` and `@payloadcms/ui` peer ranges instead of the peer floor, the React devDependency inside the `react` peer range, and that runtime code imports no package besides its declared peers; new `tests/dependencies.test.ts` checks the lockfile against the advisory list and drizzle-kit's loader on the lifted esbuild; `tests/readme.test.ts` checks the Compatibility line names the tested Payload version.
- **README:** the Compatibility line says the repo is tested against Payload 3.93.0 and React 19.3; the peer ranges stay as they are.
- **No release.** `version` stays 0.5.0, so the merge runs Release, which finds tag `v0.5.0` and publishes nothing (design 2). The published 0.5.0's peer ranges already accept Payload 3.93.0, `@payloadcms/ui` 3.93.0 and React 19.3.1, and it declares no Next.js peer.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `package-release`: Payload devDependencies pinned to one version inside the peer ranges (no longer the floor); the peer ranges accept the current stack; the lockfile is clear of the November 2026 advisories; the development toolchain (TypeScript 6, Vitest 5, ESLint 9); the README names the tested Payload version.

## Impact

- Files: `package.json` (devDependencies, new `resolutions`), `yarn.lock`, `tsconfig.json`, `README.md` (one line), `tests/package.test.ts`, `tests/readme.test.ts`, new `tests/dependencies.test.ts`. Possibly lint-only code edits if the newer typescript-eslint reports new errors (design 7).
- No change to `src/`, the published entry points, `peerDependencies`, `engines`, the workflows, `scripts/check-packed.mjs`, the dev app's import map or the version.
- Apps that use the package: none. 0.5.0 stays the published version; apps upgrade Payload, Next.js and React in their own lockfiles, and 0.5.0 (like 0.3.0 and 0.4.0) accepts those versions.

## Out of scope

- Publishing a new version, or raising the peer floors to `^3.93.0` (design 2; the reviewer can ask for it).
- Removing the unused template devDependencies (`open`, `sort-package-json`, `qs-esm`, `@swc-node/register`, `@eslint/eslintrc`, `eslint-config-next`): they are bumped, not removed, so the batch changes no setup beyond the upgrades.
- Replacing `@payloadcms/eslint-config` (last published March 2025) with a newer lint setup, which would bring ESLint 10 within reach: a lint change, not an upgrade.
- OpenSpec 2.0.0: a new major published 11 Nov 22:46 UTC, held by the age gate and not reviewed here; a later change can take it.
- `deepmerge` 4.3.1: no fixed release exists and Payload 3.93.0 pins it exactly; it stays, listed in design › Advisories.
- Any change to the plugin's behaviour, schema, admin components or API.
