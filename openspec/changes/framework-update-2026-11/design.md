## Context

- Base: `origin/main` at 47ffd7f, the 0.5.0 release (tag `v0.5.0` points at it; npm lists 0.3.0, 0.4.0 and 0.5.0, `latest` 0.5.0). Branch `update/2026-11-security`. The repo has no `qa` branch. This plan was first written on 492852b (0.3.0) and was refreshed onto 47ffd7f on 12 Nov 2026. Every version, path and count below was re-read on the 0.5.0 base and the registry that day.
- Yarn 4.18.1. `.yarnrc.yml` has only `nodeLinker: node-modules` and `enableTelemetry: false`, so Yarn's default 1-day age gate applies. CI (`ci.yml`) runs on Node 22. Release (`release.yml`) runs on Node 24, on every push to `main`.
- Runtime imports under `src/`: `payload` (32 import lines), `react` (12), `@payloadcms/ui` (12), `@payloadcms/ui/shared` (1) and `node:buffer` (1). The package has no `dependencies`. Its peers are `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`. It has three entries: `.`, `./shared` and `./client`. `./client` holds the `'use client'` admin components added in 0.4.0. Next.js is used only by the dev admin app in `dev/` (`yarn dev`), which CI doesn't build. The dev app's import map (`dev/app/(payload)/admin/importMap.js`) is committed.
- Tests: 214 `test(` calls in 32 files (a static count; Vitest's own count is the one to report). The 7 files under `tests/admin/` run in jsdom (`// @vitest-environment jsdom`) with `@testing-library/react` and a mock of `@payloadcms/ui` (`tests/admin/payload-ui-mock.tsx`). `vitest.config.js` includes `tests/**/*.test.tsx`. The integration tests boot the dev app's Payload on SQLite (`push: true`, a temp file per process) with outbound HTTP blocked (`tests/setup/no-network.ts`).
- Published 0.5.0 tarball: 168 files (`dist.fileCount` on the registry).
- Lint config: `@payloadcms/eslint-config` 3.28.0, the newest published (11 March 2025); Payload's plugin template still ships it. It pins exact `dependencies`: `eslint` 9.22.0, `@eslint/js` 9.22.0, `typescript` 5.7.3, `typescript-eslint` and `@typescript-eslint/parser` 8.26.1, `eslint-plugin-import-x` 4.6.1, `eslint-plugin-perfectionist` 3.9.1, `eslint-plugin-jsx-a11y` 6.10.2 and others. `@payloadcms/eslint-plugin` 3.28.0 pins the same set.
- No `.yarn/patches` and no `patch:` entries in `package.json`. The only patch in the lockfile is Yarn's built-in TypeScript compat patch, which Yarn applies by itself.

## Goals / Non-Goals

**Goals:**
- Every advisory in the 11 November list fixed in the lockfile, except `deepmerge` (no fix exists).
- Every direct devDependency on its latest stable version, or held back with evidence.
- Every existing check passing: `yarn check:packed`, tests, build, lint, typecheck and `yarn spec:validate`.
- The smallest step for apps: no release.

**Non-Goals:** behaviour, schema, admin component or API changes; a new version on npm; a new lint setup.

## Decisions

### 1. Versions

Set each devDependency to the target in the Versions table below and keep each entry's style: exact versions stay exact, and caret ranges become `^<target>`. Add `"vite": "8.3.8"`. The Payload packages (`payload`, `@payloadcms/db-sqlite`, `@payloadcms/next`, `@payloadcms/ui`) share one exact version, 3.93.0.

React is 19.3.1, the newest release, and every range that applies accepts it:
- Next.js 16.4.6 declares `react ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0`.
- `@payloadcms/ui` 3.93.0 declares `^19.0.1 || ^19.1.2 || ^19.2.1`.
- The package's own peer is `react ^19.2.1`.
- `@testing-library/react` 16.3.3 declares `^18.0.0 || ^19.0.0`.

### 2. No release; 0.5.0 accepts the new stack

- `version` stays `0.5.0`. On the merge, Release's "Prepare the release" step finds tag `v0.5.0` and sets `publish=false` ("v0.5.0 already exists. Nothing to release."). Nothing is installed, built or published by it. CI runs every check on the branch and the PR.
- Why no release is needed: the published 0.5.0 manifest (`npm view payload-dynamic-forms@0.5.0`) has no `dependencies`. Its peers are `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`, so none of the advisories travel inside the package. Apps get `next`, `react`, `payload` and their sub-dependencies from their own lockfiles.
- 0.5.0 and the site stack:
  - Payload 3.93.0 and `@payloadcms/ui` 3.93.0 are inside `^3.92.1`, and React 19.3.1 is inside `^19.2.1`.
  - Next.js 16.4.6 is not a peer, and `src/` doesn't import it.
  - Every `@payloadcms/ui` name the admin components import is still exported by 3.93.0 (design 8).
  - A site on Payload 3.93.0, React 19.3.1 and Next.js 16.4.6 can therefore keep `payload-dynamic-forms` 0.5.0. Sites still on 0.3.0 or 0.4.0 can keep those too, because they have the same peers or fewer.
- Rejected: 0.5.1 with the peer floors raised to `^3.93.0`. A peer floor patches no app, because each app's own update moves Payload. It would warn apps still on 3.92.x, and a publish needs its own yes and registry checks.
- Rejected: widening the peers (e.g. `^3.0.0`), because 0.5.0 was never tested below 3.92.1.
- The README on GitHub says "tested against 3.93.0" at once. The npm page keeps 0.5.0's README until the next release, which is fine.

### 3. Payload devDependencies: one version inside the peer ranges

- `tests/package.test.ts` › "package metadata and licence agree" asserted that every Payload devDependency equals the peer floor 3.92.1. It now asserts that they all share one exact version.
- A new test asserts that this version is inside both the `payload` and the `@payloadcms/ui` peer range: same major as the range, and not below 3.92.1.
- The same test asserts that the `react` devDependency is an exact version inside `^19.2.1`: major 19, and not below 19.2.1.
- The comparison uses a small numeric helper in the test (no new dependency).
- The floors (Payload 3.92.1, React 19.2.1) are no longer retested here. 0.5.0 was tested on them, and `src/` doesn't change.
- `yarn check:packed` installs `payload`, `@payloadcms/ui`, `react`, `react-dom`, `@types/react` and `typescript` at their devDependency versions, so it now proves the packed package against 3.93.0, React 19.3.1 and TypeScript 6.0.3. `scripts/check-packed.mjs` itself doesn't change.

### 4. Resolutions

Add to `package.json`:

```json
"resolutions": {
  "@esbuild-kit/core-utils/esbuild": "0.25.12",
  "@eslint/js": "9.39.5",
  "@swc/cli/minimatch": "11.0.8",
  "@typescript-eslint/parser": "8.72.2",
  "@typescript-eslint/typescript-estree/minimatch": "11.0.8",
  "eslint": "9.39.5",
  "eslint-plugin-import-x/minimatch": "11.0.8",
  "eslint-plugin-perfectionist/minimatch": "11.0.8",
  "typescript": "6.0.3",
  "typescript-eslint": "8.72.2"
}
```

The 0.5.0 lockfile has the same parents for each of these as the 0.3.0 lockfile did (re-read 12 Nov). The packages added in 0.4.0 (`jsdom`, `@testing-library/*`) bring no new parent of `minimatch`, `esbuild`, `file-type`, `@eslint/plugin-kit` or `yaml`.

- **`esbuild`.** 0.18.20 comes from `drizzle-kit` 0.31.7 (pinned exactly by `@payloadcms/db-sqlite` 3.93.0) › `@esbuild-kit/esm-loader` › `@esbuild-kit/core-utils` 3.3.2. core-utils' last release (deprecated, "merged into tsx") depends on `esbuild ~0.18.20`.
  - The fix is 0.25.0. 0.25.12 is the version `drizzle-kit` itself already uses (`^0.25.4`), so it dedupes.
  - core-utils calls only esbuild's `transform` and `transformSync` (read in its `dist/index.js`). The new test proves it still transforms.
- **`minimatch`.** 9.0.9 and 10.2.6 are fixed only in 11.0.1. There is no 9.x or 10.x backport (latest 9.x is 9.0.9, latest 10.x is 10.2.6).
  - After the upgrades, the parents on `^9` or `^10` are `@swc/cli` 0.8.2 (`^9.0.3`), `@typescript-eslint/typescript-estree` 8.72.2 (`^10.2.2`), `eslint-plugin-import-x` 4.6.1 (`^9.0.3`) and `eslint-plugin-perfectionist` 3.9.1 (`^9.0.5`).
  - minimatch 11 removed `makeRe()`, `Minimatch#regexp`, the `AST` class, `debug` and `matchOne()` (its changelog).
  - Read in each parent's published code: `@swc/cli`, typescript-estree and perfectionist call only `minimatch()`. import-x calls `minimatch()` and `new Minimatch()`, and `makeRe` only in its `no-internal-modules` rule. The Payload config doesn't turn that rule on: it sets only `import-x/no-duplicates` and `import-x/prefer-default-export`.
  - A global `minimatch` resolution would break the `^3` users (eslint 9, eslint-plugin-react, glob 7), so the lines are scoped by parent.
  - If any other parent still resolves 9.x or 10.x after the install: when its code uses none of the removed APIs, give it the same `<parent>/minimatch` line; otherwise block.
- **`@eslint/plugin-kit`.** 0.2.8 comes from `eslint` 9.22.0, pinned by both Payload ESLint packages. Resolving `eslint` and `@eslint/js` to 9.39.5 leaves one ESLint. 9.39.5 is the top-level ESLint already in the lockfile, and its plugin-kit range is `^0.4.1`.
- **`typescript`, `typescript-eslint` and `@typescript-eslint/parser`** resolve to the top-level versions, so lint and typecheck use one TypeScript (6.0.3). typescript-eslint 8.26.1 supports only TypeScript `<5.9.0`; 8.72.2 supports `>=4.8.4 <6.1.0`.
- **`file-type`** 20.5.0 needs no resolution. It came from `@swc/cli` 0.6.0 › `@xhmikosr/bin-wrapper` 13. `@swc/cli` 0.8.2 uses bin-wrapper 14, whose downloader 16.3.1, archive-type 8.1.0 and decompress-tar 9.0.2 depend on `file-type ^21.3.4`. swc's 0.8.1 changelog says: "Bump @xhmikosr/bin-wrapper to v14 to resolve CVE-2026-31808".

### 5. TypeScript 6 settings

TypeScript 6.0 changes defaults and deprecates options (release notes, "Breaking Changes and Deprecations in TypeScript 6.0"). For this repo, in `tsconfig.json`:
- **Remove `"baseUrl": "."`.** It is deprecated in 6.0 and is an error unless `ignoreDeprecations` is set. The four `paths` entries already start with `./`, so they resolve the same without it.
- **Add `"types": ["node"]`.** 6.0 includes no `@types` package by default, and tests use Node globals: `Buffer` in `tests/webhook.test.ts` and `process` in `dev/payload.config.ts`. Nothing else is needed:
  - Vitest's API is imported explicitly.
  - JSX resolves `react/jsx-runtime` as a module, not through `types`.
  - The jsdom tests' DOM globals come from `lib: ["DOM", …]`. 6.0 folds `dom.iterable` into `dom`, and `DOM.Iterable` stays valid.
- **Add `"noUncheckedSideEffectImports": false`.** 6.0 turns it on by default. That makes the dev app's side-effect imports errors: `import '@payloadcms/next/css'` (three files) and `import './custom.scss'` (one file). No declaration covers them in CI, because `next-env.d.ts` is generated by `next dev` and is git-ignored. Setting it to false keeps 5.x behaviour. `src/` and `tests/` have no side-effect imports.
- **Unchanged and still right:**
  - `rootDir: "./src"` is already explicit in `tsconfig.build.json`, which now includes `.tsx`. Without it, 6.0's new default would be `.`.
  - `strict`, `module`, `target` and `esModuleInterop` are set explicitly.
  - `check:packed`'s scratch tsconfig sets `strict`, `module`, `target` and `skipLibCheck`. Its `check.ts` has no side-effect import and needs no Node types, so 6.0's defaults don't reach it.
- **No `ignoreDeprecations`.** If `yarn typecheck`, `yarn build` or `yarn check:packed` fails for a reason not listed here, block with the errors.

### 6. Vitest 5

From the Vitest 5 migration guide, the changes that touch this repo:
- **`vite` is a required peer**, and Yarn doesn't install peers. Add `vite` 8.3.8: `vitest` 5.1.0 accepts `^6.4.0 || ^7.0.0 || ^8.0.0`, and `vite-tsconfig-paths` 6.1.1 accepts any.
  - Node: Vitest 5 needs `^22.12.0 || ^24.0.0 || >=26.0.0`. CI uses 22 (latest 22.x), and `engines` already require `^22.23.4 || >=24.22.1`.
  - `jsdom` is an optional peer (`*`). jsdom 31.0.0 needs `^22.22.2 || ^24.15.0 || >=26.0.0`, which fits CI and Release.
- **`clearMocks` defaults to `true`.** No test should change, because every spy in the suite is created and asserted inside one test:
  - `vi.fn` / `vi.spyOn` in tests/webhook.test.ts, tests/plugin-config.test.ts, tests/turnstile.test.ts, tests/admin/default-fields.test.tsx, tests/int/delivery.int.test.ts and tests/int/attachments.int.test.ts. The `logger.warn` spy in tests/webhook.test.ts is a default argument of a helper called inside each test.
  - `tests/admin/payload-ui-mock.tsx` holds no `vi.fn`.
  - Keep the v5 default. If a test fails only because of it, set `clearMocks: false` in `vitest.config.js` and say so.
- **Hoisted `vi.mock` calls must be at the top level** (v5 throws otherwise). The 14 `vi.mock` calls (2 in each `tests/admin/*.test.tsx`) are all at the top level.
- **DOM-environment global assignments now update the jsdom window.** The no-network setup file assigns `globalThis.fetch`, and tests/admin/default-fields.test.tsx stubs `fetch` with `vi.stubGlobal`. No effect is expected, because the components call the global `fetch`. If a jsdom test fails only because of this, block with the test name and error.
- **Unawaited async assertions now fail.** The suite's two (`.resolves` in tests/int/access.int.test.ts, `.rejects` in tests/int/boot.int.test.ts) are both awaited.
- **Not used here** (checked by grep): `test.each`/`test.for`, so no test title changes with v5's `pretty-format` titles and every CHECK name stays valid. Also unused: `toThrow('')`, `vi.hoisted`, `test.sequential`, `bench`, `expect.poll`, `VITEST_POOL_ID`/`VITEST_WORKER_ID` (the dev app names its database by process id and a random suffix), projects, coverage and browser mode.
- **The JSON reporter** now writes `.vitest/json/output.json` unless `--outputFile` is given. The planner's review rerun passes `--outputFile`, so it is unaffected. `yarn test` (default reporter) doesn't create `.vitest/`; if it appears, add it to `.gitignore`.

### 7. ESLint 9 and the lint result

ESLint 10.14.0 is held. `eslint-plugin-jsx-a11y` 6.10.2 is pinned by the Payload config and is itself the latest release (re-read 12 Nov), and it declares `eslint ^3 || … || ^9`. So do the other pinned plugins: `eslint-plugin-import-x` 4.6.1 (`^8.57.0 || ^9.0.0`), `eslint-plugin-jest` 28.11.0, `@eslint-react/eslint-plugin` 1.31.0 and `eslint-plugin-jest-dom` 5.5.0. No newer `@payloadcms/eslint-config` exists.

`yarn lint` must report no errors. It now also covers the `.tsx` admin components and their tests. typescript-eslint 8.26.1 → 8.72.2 stays within one major. If it reports new errors, fix them in code without changing behaviour and without turning rules off, and list each one. More than 10 new errors: block.

### 8. Payload items from the batch brief

- **Migrations:** none. The repo has no migrations directory, and the dev app uses `push: true` on SQLite. Apps that install the plugin own their migrations. Their own update plans run `payload migrate:create --skip-empty` with Payload 3.93.0 and this package installed.
- **D1 upsert wrapper:** not used here (no D1 adapter in this repo).
- **Payload 3.92.1 → 3.93.0 release notes:** security fixes (block child read access in queries, blocks restricted to each field's configured types, `pasteURL` restrictions, XSL response policy, OG endpoint clamp), `auth.passwordHashIterations`, drizzle-kit loaded lazily, and UI fixes. None changes an API the plugin calls. The forms collection uses blocks, so the full integration suite (form save, access, submit, delivery) is the proof.
- **Admin components on 3.93.0** (both `@payloadcms/ui` tarballs read on 12 Nov):
  - Every name `src/` imports is still exported by 3.93.0: `Button`, `DatePicker`, `FieldDescription`, `FieldError`, `FieldLabel`, `SelectInput`, `TextInput`, `useConfig`, `useField`, `useFormFields` and `useRowLabel` from `@payloadcms/ui`, and `mergeFieldStyles` from `@payloadcms/ui/shared`.
  - These files in `dist/` are byte-identical to 3.92.1: `fields/Text/Input.js`, `fields/Slug/index.js`, `fields/Select/Input.js` and `elements/DatePicker/DatePicker.js`. So the `form-rules` scenario that mirrors `@payloadcms/ui@3.92.1` `fields/Slug`, and the 3.92.1 element tree described in `tests/admin/payload-ui-mock.tsx`, still describe 3.93.0. No spec or mock edit is needed.
  - The dev app's import map names `SlugField` from `@payloadcms/next/client`, which 3.93.0 still exports.
  - `yarn typecheck` against 3.93.0 and `yarn generate:importmap` leaving no diff are the proof.

### 9. README

In `## Compatibility`, replace this line:

`- Payload \`^3.92.1\` (developed and tested against 3.92.1). Payload 4 is not supported yet.`

with:

`- Payload \`^3.92.1\` (tested against 3.93.0 and React 19.3, with Next.js 16.4 in the dev app; the published 0.5.0 was tested against 3.92.1 and React 19.2). Payload 4 is not supported yet.`

No other README edit, and no changelog entry (no release).

### 10. Yarn's age gate

Yarn 4.18.1 refuses versions under 24 hours old (`npmMinimalAgeGate` default 1 day; `.yarnrc.yml` doesn't change it). Checked against 12 Nov 16:00 UTC, every target in the Versions table is at least a day old by then. The youngest are `vite` 8.3.8 (11 Nov 02:49 UTC), `minimatch` 11.0.8 (11 Nov 09:50 UTC) and `prettier` 3.10.0 (11 Nov 12:30 UTC). Two newer releases are younger and are pinned one back:

- **`@fission-ai/openspec` 2.0.0** was published 11 Nov 22:46 UTC, so it is quarantined until 12 Nov 22:46 UTC. It is also a new major whose CLI changes were not reviewed. The target is 1.17.0 (9 Nov), exact.
- **`prettier` 3.10.1** was published 12 Nov 07:06 UTC, so it is quarantined until 13 Nov 07:06 UTC. The target range is `^3.10.0`. Yarn 4.18.1's npm resolver drops quarantined versions from a range's candidates and throws YN0016 only when "All versions satisfying … are quarantined" (read in its `yarn.js`). So the lockfile gets 3.10.0 before 13 Nov 07:06 UTC and 3.10.1 after; either is fine. Transitive packages resolve the same way.

The card can start now. Never set `YARN_NPM_MINIMAL_AGE_GATE` or `npmMinimalAgeGate`; that exception is for Kairos's own packages only. If `yarn install` still stops with YN0016, block.

## Research

- **Registry, 12 Nov 2026 15:10 UTC** (`registry.npmjs.org/<pkg>`: dist-tags, versions, `time`, peers, engines, dependencies). Read for every row of the Versions table, plus:
  - `payload@3.93.0`: engines `^22.23.4 || >=24.22.1`, peer `graphql ^16.8.1`, `deepmerge 4.3.1`, `file-type 21.3.4`.
  - `@payloadcms/next@3.93.0`: peer `next >=15.2.9 <15.3.0 || … || >=16.3.3 <17.0.0`, `payload 3.93.0`.
  - `@payloadcms/ui@3.93.0`: React peers above, `payload 3.93.0`.
  - `@payloadcms/db-sqlite@3.93.0`: `drizzle-kit 0.31.7`.
  - `typescript-eslint@8.72.2`: peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`.
  - `vitest@5.1.0`: peers and engines above. `jsdom@31.0.0`: engines. `@testing-library/react@16.3.3`: peers.
  - `@esbuild-kit/core-utils`: latest 3.3.2, deprecated. `minimatch` and `@fission-ai/openspec`: versions and dates. `deepmerge`: latest 4.3.1.
  - `payload-dynamic-forms`: versions `["0.3.0","0.4.0","0.5.0"]`, 0.5.0 peers as above, 168 files.
- **Advisories, 12 Nov 2026.** Every name and version in the 0.5.0 `yarn.lock` was posted to the registry's bulk advisory endpoint (`/-/npm/v1/security/advisories/bulk`, the source `yarn npm audit` uses).
  - It returns only packages on the 11 Nov list: `next`, `vitest`, `@vitest/mocker`, `esbuild`, `file-type`, `minimatch`, `yaml`, `@eslint/plugin-kit` and `deepmerge`. `payload` and `@payloadcms/next` 3.92.1 come from the stack-watch list, which reads Payload's own advisories.
  - The same query on the target versions returns only `deepmerge` 4.3.1.
- **Package source read from tarballs** (into `$TMPDIR`):
  - minimatch call sites in `@swc/cli` 0.8.2, `@typescript-eslint/typescript-estree` 8.26.1 and 8.72.2, `eslint-plugin-import-x` 4.6.1 (`makeRe` only in `lib/rules/no-internal-modules.js`) and `eslint-plugin-perfectionist` 3.9.1.
  - `@payloadcms/eslint-config` 3.28.0 `index.mjs` (enabled import-x rules).
  - `@esbuild-kit/core-utils` 3.3.2 (`transform`, `transformSync` only).
  - `@payloadcms/ui` 3.92.1 and 3.93.0 (exports and the identical field files, design 8), and `@payloadcms/next` 3.93.0 `exports/client` (`SlugField`).
  - `@yarnpkg/cli-dist` 4.18.1 (age-gate handling of ranges, design 10).
  - `typescript@7.0.2`'s manifest: its `.` export is `./lib/version.cjs` and the compiler API is under `./unstable/*`. So `ts.createSourceFile` (used by tests/workers-safe.test.ts), typescript-eslint and `@swc-node/register` (peer `typescript >= 4.3 < 7`) can't run on it. TypeScript 7 is held on that evidence.
- **Release notes and guides:**
  - Payload v3.93.0 release (github.com/payloadcms/payload/releases/tag/v3.93.0).
  - Next.js v16.4.6 release (backports: route handler compression, Turbopack GC; no upgrade guide within 16.x).
  - TypeScript 6.0 announcement (devblogs.microsoft.com/typescript/announcing-typescript-6-0/, re-read 12 Nov).
  - Vitest 5 migration guide (vitest.dev/guide/migration/, re-read 12 Nov).
  - minimatch changelog (github.com/isaacs/minimatch, `changelog.md`, 11.0 section).
  - `@swc/cli` CHANGELOG (0.7: chokidar 4; 0.8: chokidar 5, optional peer, watch mode only; 0.8.1: bin-wrapper 14).
  - Yarn manifest docs for `resolutions` (yarnpkg.com/configuration/manifest#resolutions: `name`, `parent/name` and `parent@range/name` keys).
- **Options for the transitive fixes:**
  - (a) Wait for upstream: `drizzle-kit` is pinned by Payload, `@esbuild-kit/*` is abandoned, and minimatch 9/10 have no backport. That leaves the critical advisories' neighbours open, so it is rejected.
  - (b) A `yarn up -R` refresh can't move a package past its parent's range, so it fixes none of these.
  - (c) Scoped `resolutions`: picked. Each line is checked by a test or the audit.
- **Options for the release:** none (picked, design 2); 0.5.1 with raised floors; 0.5.1 unchanged.
- **Limits stated here:**
  - "TypeScript 7 has no classic compiler API" comes from 7.0.2's `exports` map, not from running it.
  - "typescript-eslint keeps new rules out of `recommended` within a major" is not checked; design 7 caps the risk.
  - The test count (214) is a static count of `test(` calls; nothing was installed or run on the planning host.

## Versions

| Package | Current | Target | Why |
|---|---|---|---|
| `payload` | 3.92.1 | 3.93.0 | High advisory; latest |
| `@payloadcms/db-sqlite`, `@payloadcms/next`, `@payloadcms/ui` | 3.92.1 | 3.93.0 | One Payload version; `@payloadcms/next` moderate advisory |
| `@payloadcms/eslint-config` | 3.28.0 | 3.28.0 | Latest published; its pins lifted by design 4 |
| `next` | 16.3.3 | 16.4.6 | Critical advisory (fixed in 16.4.5); latest; `@payloadcms/next` peer `>=16.3.3 <17` |
| `eslint-config-next` | 16.3.3 | 16.4.6 | Same as `next` (not used by `eslint.config.js`) |
| `react`, `react-dom` | 19.2.6 | 19.3.1 | Latest; accepted by every range that applies (design 1) |
| `@types/react`, `@types/react-dom` | 19.2.14, 19.2.3 | 19.3.0 | Latest; React 19.3 |
| `@testing-library/react` | 16.3.3 | 16.3.3 | Latest; peers accept React 19.3 |
| `@testing-library/dom` | 10.4.2 | 10.4.2 | Latest |
| `jsdom` | 31.0.0 | 31.0.0 | Latest; Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| `vitest` | 4.0.18 | 5.1.0 | Critical advisory (fixed in 4.1.11) and `@vitest/mocker`; latest major (design 6) |
| `vite` (new) | 7.3.7, via vitest 4 | 8.3.8 | Vitest 5 peer; Yarn installs no peers |
| `vite-tsconfig-paths` | 6.0.5 | 6.1.1 | Latest |
| `typescript` | 5.7.3 | 6.0.3 | Newest that typescript-eslint supports; 7.0.2 held (Research) |
| `eslint` | ^9.23.0 (9.39.5) | ^9.39.5 | 10.14.0 held (design 7) |
| `@eslint/eslintrc` | ^3.2.0 (3.3.7) | ^3.3.7 | Latest |
| `prettier` | ^3.4.2 (3.9.10) | ^3.10.0 | 3.10.1 is under a day old at 12 Nov 16:00 UTC; the range takes it once the gate passes (design 10) |
| `@fission-ai/openspec` | 1.16.0 | 1.17.0 | Newest past the age gate; 2.0.0 (11 Nov 22:46 UTC, new major) held (design 10); engines `>=22.12.0` |
| `@swc/cli` | 0.6.0 | 0.8.2 | Latest; clears `file-type` 20 (design 4) |
| `@swc/core` | 1.15.47 | 1.16.22 | Latest |
| `@swc-node/register` | 1.10.9 | 1.12.1 | Latest |
| `@types/node` | 22.19.9 | 22.20.5 | Newest 22.x; the package supports Node 22 (`engines`), so 26.x types would allow APIs Node 22 lacks |
| `cross-env` | ^7.0.3 | ^10.1.0 | Latest major: ESM, Node >= 20; `cross-env VAR=x cmd` unchanged |
| `graphql` | ^16.8.1 (16.15.0) | ^16.15.0 | 17.1.0 held: `payload` and `@payloadcms/next` 3.93.0 peer `^16.8.1` |
| `open` | ^10.1.0 (10.2.0) | ^11.0.4 | Latest major (Node >= 20); not called by any script |
| `qs-esm` | 8.0.1 | 8.0.2 | Latest; not imported here (Payload pins its own 8.0.1) |
| `rimraf` | 3.0.2 | 6.1.4 | Latest major; `rimraf dist tsconfig.build.tsbuildinfo` passes literal paths, unaffected by v4's glob change |
| `sort-package-json` | ^2.10.0 (2.15.1) | ^4.1.0 | Latest major (Node >= 22); not called by any script |
| `standardwebhooks` | 1.1.1 | 1.1.1 | Latest |
| `yaml` | 2.8.1 | 2.9.1 | Moderate advisory (fixed in 2.8.3); latest |
| `peerDependencies` | `payload ^3.92.1`, `@payloadcms/ui ^3.92.1`, `react ^19.2.1` | unchanged | Accept 3.93.0 and React 19.3.1 (design 2) |
| `version` | 0.5.0 | 0.5.0 | No release (design 2) |

## Advisories

| Advisory package | Fixed in | Fix here | Proven by |
|---|---|---|---|
| `next` 16.3.3 (critical) | 16.4.5 | direct 16.4.6 | tests/dependencies.test.ts, audit |
| `vitest` 4.0.18 (critical) | 4.1.11 | direct 5.1.0 | same |
| `payload` 3.92.1 (high) | 3.93.0 | direct | same |
| `@payloadcms/next` 3.92.1 | 3.93.0 | direct | same |
| `@vitest/mocker` 4.0.18 | 4.1.12 | with vitest 5.1.0 | same |
| `esbuild` 0.18.20 | 0.25.0 | resolution under `@esbuild-kit/core-utils` | same, plus the loader test |
| `file-type` 20.5.0 | 21.3.2 | `@swc/cli` 0.8.2 | same |
| `minimatch` 9.0.9, 10.2.6 | 11.0.1 | scoped resolutions to 11.0.8 | same, plus `yarn lint` and `yarn build` |
| `yaml` 2.8.1 | 2.8.3 | direct 2.9.1 | same |
| `@eslint/plugin-kit` 0.2.8 | 0.3.4 | `eslint` resolution to 9.39.5 (plugin-kit `^0.4.1`) | same |
| `deepmerge` 4.3.1 (low) | no fix yet | **remains** | audit lists it |

Remaining: `deepmerge` 4.3.1 (prototype poisoning in `mergeObject()`).
- No fixed release exists (the latest on npm is still 4.3.1), and `payload` 3.93.0 depends on exactly 4.3.1.
- Here it runs only in tests and the dev app. The package doesn't ship it; apps carry it through their own Payload.
- Re-check when Payload or deepmerge release a fix.

An advisory published after 12 Nov 2026 is reported in the builder's summary, not fixed in this change.

## Breaking changes that touch this repo

| Upgrade | Change | Where it touches | Task |
|---|---|---|---|
| TypeScript 6 | `baseUrl` deprecated | `tsconfig.json` | 2.1 |
| TypeScript 6 | `types` defaults to `[]` | Node globals in tests and the dev app | 2.1 |
| TypeScript 6 | `noUncheckedSideEffectImports` on by default | dev app CSS imports | 2.1 |
| TypeScript 6 | `rootDir` defaults to `.` | none: `tsconfig.build.json` sets `./src` (`dist/` layout checked for all three entries) | 2.1 |
| Vitest 5 | `vite` is a peer | `package.json` | 1.1 |
| Vitest 5 | `clearMocks` on by default | none expected (design 6) | 3.1 |
| Vitest 5 | nested `vi.mock` throws; DOM globals propagate to the jsdom window | `tests/admin/*.test.tsx`: mocks at top level; none expected (design 6) | 3.1 |
| minimatch 11 (resolution) | `makeRe`, `regexp`, `AST` removed | not on any enabled path (design 4) | 1.1, 4.1 |
| esbuild 0.25 (resolution) | 0.18 → 0.25 under core-utils | `transform`/`transformSync` only | 1.1 |
| ESLint 9.22 → 9.39, typescript-eslint 8.26 → 8.72 (resolutions) | minor releases | lint result, including `.tsx` | 4.1 |
| `@swc/cli` 0.8 | chokidar 5, bin-wrapper 14 | `build:swc` command unchanged; `'use client'` kept on `dist/exports/client.js` (checked by `check:packed`) | 6.1 |
| `rimraf` 6, `cross-env` 10 | ESM, Node >= 20; rimraf no globs by default | `clean`, `dev:payload`, `generate:importmap`, `spec:validate` scripts, literal args | 6.1 |
| Payload 3.93.0 | block access and block-type checks | forms collection blocks | 3.1, 6.1 |
| Payload 3.93.0 (`@payloadcms/ui`) | none for the names the admin components use (design 8) | `src/admin/*`, import map | 2.1, 6.1 |
| Next.js 16.4, React 19.3 | minor releases | `/client` entry, jsdom component tests, dev app; `examples/minimal-form.tsx` typecheck | 3.1, 6.1 |

## Risks / Trade-offs

- Forcing minimatch 11 on tools that ask for 9 or 10 is outside their declared ranges. Mitigation: the call sites were read (design 4), and lint and build run every enabled path. If a later tool update needs a removed API, the resolution line goes.
- Holding ESLint at 9 leaves the lint toolchain one major behind. ESLint 9 is still published with fixes (9.39.5, July 2026). Moving needs a lint config other than Payload's, which is out of scope.
- The peer floors (Payload 3.92.1, React 19.2.1) are no longer exercised by this repo's tests (design 3).
