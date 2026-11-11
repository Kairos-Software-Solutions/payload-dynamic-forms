## Context

- Base: `origin/main` at 492852b, the 0.3.0 release (tag `v0.3.0` points at it; npm lists only 0.3.0). Branch `update/2026-11-security`. The repo has no `qa` branch.
- Yarn 4.18.1, `nodeLinker: node-modules`. CI (`ci.yml`) runs on Node 22; Release (`release.yml`) on Node 24, on every push to `main`.
- `src/` imports only `payload` (22 imports) and `node:buffer`. The package has no `dependencies`; its one peer is `payload ^3.92.1`. Next.js and React are used only by the dev admin app in `dev/` (`yarn dev`), which CI doesn't build.
- The integration tests boot the dev app's Payload on SQLite (`push: true`, a temp file per process) with outbound HTTP blocked.
- Lint config: `@payloadcms/eslint-config` 3.28.0, the newest published (11 March 2025), as Payload's plugin template still ships it. It pins exact `dependencies`: `eslint` 9.22.0, `@eslint/js` 9.22.0, `typescript` 5.7.3, `typescript-eslint` and `@typescript-eslint/parser` 8.26.1, `eslint-plugin-import-x` 4.6.1, `eslint-plugin-perfectionist` 3.9.1, `eslint-plugin-jsx-a11y` 6.10.2 and others. `@payloadcms/eslint-plugin` 3.28.0 pins the same set.
- No `.yarn/patches` and no `patch:` entries in `package.json`; the only patch in the lockfile is Yarn's built-in TypeScript compat patch, which Yarn applies by itself.

## Goals / Non-Goals

**Goals:** every advisory in the 11 November list fixed in the lockfile except `deepmerge` (no fix exists); every direct devDependency on its latest stable version or held back with evidence; every existing check passing (`yarn check:packed`, tests, build, lint, typecheck, `yarn spec:validate`); the smallest step for apps (no release).

**Non-Goals:** behaviour, schema or API changes; a new version on npm; a new lint setup.

## Decisions

### 1. Versions

Set each devDependency to the target in the Versions table below and keep each entry's style: exact versions stay exact, caret ranges become `^<target>`. Add `"vite": "8.3.8"`. Payload packages (`payload`, `@payloadcms/db-sqlite`, `@payloadcms/next`, `@payloadcms/ui`) share one exact version, 3.93.0. React 19.3.1: Next.js 16.4.6 declares `react ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0`, and `@payloadcms/ui` 3.93.0 declares `^19.0.1 || ^19.1.2 || ^19.2.1`; both accept 19.3.1, the newest React.

### 2. No release; 0.3.0 accepts the new stack

- `version` stays `0.3.0`. On the merge, Release's "Prepare the release" step finds tag `v0.3.0` and sets `publish=false` ("v0.3.0 already exists. Nothing to release."), so nothing is installed, built or published by it; CI runs every check on the branch and the PR.
- Why no release is needed: the published 0.3.0 manifest (`npm view payload-dynamic-forms@0.3.0`) has no `dependencies` and the single peer `payload ^3.92.1` (`>=3.92.1 <4.0.0`), so none of the advisories travel inside the package. Apps get `next`, `react`, `payload` and their sub-dependencies from their own lockfiles.
- 0.3.0 and the site stack: Payload 3.93.0 is inside `^3.92.1`. React 19.3.1 and Next.js 16.4.6 are not peers of the package, and `src/` imports neither (checked: every bare import under `src/` is `payload`), so 0.3.0 adds no constraint on them. A site on Payload 3.93.0, React 19.3.1 and Next.js 16.4.6 can keep `payload-dynamic-forms` 0.3.0.
- Rejected: 0.3.1 with the peer raised to `^3.93.0`. A peer floor patches no app (each app's own update moves Payload), it would warn apps still on 3.92.x, and a publish needs its own yes and registry checks. Rejected: widening the peer (e.g. `^3.0.0`): 0.3.0 was never tested below 3.92.1.
- The README on GitHub says "tested against 3.93.0" at once; the npm page keeps 0.3.0's README until the next release, which is fine.

### 3. Payload devDependencies: one version inside the peer range

`tests/package.test.ts` › "package metadata and licence agree" asserted every Payload devDependency equals the peer floor 3.92.1. It now asserts they all share one exact version, and a new test asserts that version is inside the peer range (same major as the range, not below 3.92.1), compared with a small numeric helper in the test (no new dependency). The floor 3.92.1 is no longer retested here: 0.3.0 was tested on it and `src/` doesn't change. `yarn check:packed` installs `payload@<devDependency version>`, so it now proves the packed package against 3.93.0.

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

- `esbuild` 0.18.20 comes from `drizzle-kit` 0.31.7 (pinned exactly by `@payloadcms/db-sqlite` 3.93.0) › `@esbuild-kit/esm-loader` › `@esbuild-kit/core-utils` 3.3.2, whose last release (deprecated, "merged into tsx") depends on `esbuild ~0.18.20`. The fix is 0.25.0; 0.25.12 is the version `drizzle-kit` itself already uses (`^0.25.4`), so it dedupes. core-utils calls only esbuild's `transform` and `transformSync` (read in its `dist/index.js`); the new test proves it still transforms.
- `minimatch` 9.0.9 and 10.2.6: the fix is 11.0.1, with no 9.x or 10.x backport (latest 9.x is 9.0.9, latest 10.x is 10.2.6). After the upgrades the parents on `^9` or `^10` are `@swc/cli` 0.8.2 (`^9.0.3`), `@typescript-eslint/typescript-estree` (8.72.2: `^10.2.2`), `eslint-plugin-import-x` 4.6.1 (`^9.0.3`) and `eslint-plugin-perfectionist` 3.9.1 (`^9.0.5`). minimatch 11 removed `makeRe()`, `Minimatch#regexp`, the `AST` class, `debug` and `matchOne()` (its changelog). Read in each parent's published code: `@swc/cli`, typescript-estree and perfectionist call only `minimatch()`; import-x calls `minimatch()` and `new Minimatch()`, and `makeRe` only in its `no-internal-modules` rule, which the Payload config doesn't turn on (it sets only `import-x/no-duplicates` and `import-x/prefer-default-export`). A global `minimatch` resolution would break the `^3` users (eslint 9, eslint-plugin-react, glob 7), so the lines are scoped by parent. Any other parent still on 9.x or 10.x after the install gets the same `<parent>/minimatch` line if its code uses none of the removed APIs; otherwise block.
- `@eslint/plugin-kit` 0.2.8 comes from `eslint` 9.22.0, pinned by both Payload ESLint packages. Resolving `eslint` and `@eslint/js` to 9.39.5 (the top-level ESLint already in the lockfile, whose plugin-kit range is `^0.4.1`) leaves one ESLint.
- `typescript`, `typescript-eslint` and `@typescript-eslint/parser` resolve to the top-level versions so lint and typecheck use one TypeScript (6.0.3). typescript-eslint 8.26.1 supports TypeScript `<5.9.0` only; 8.72.2 supports `>=4.8.4 <6.1.0`.
- `file-type` 20.5.0 needs no resolution: it came from `@swc/cli` 0.6.0 › `@xhmikosr/bin-wrapper` 13; 0.8.2 uses bin-wrapper 14, whose downloader 16.3.1, archive-type 8.1.0 and decompress-tar 9.0.2 depend on `file-type ^21.3.4` (swc's 0.8.1 changelog: "Bump @xhmikosr/bin-wrapper to v14 to resolve CVE-2026-31808").

### 5. TypeScript 6 settings

TypeScript 6.0 changes defaults and deprecates options (release notes, "Breaking Changes and Deprecations in TypeScript 6.0"). For this repo, in `tsconfig.json`:
- Remove `"baseUrl": "."`. Deprecated in 6.0 (an error unless `ignoreDeprecations` is set); the `paths` entries already start with `./`, so they resolve the same without it.
- Add `"types": ["node"]`. 6.0 includes no `@types` package by default; tests use Node globals (`Buffer` in `tests/webhook.test.ts`, `process` in `dev/payload.config.ts`). Vitest's API is imported explicitly, so nothing else is needed.
- Add `"noUncheckedSideEffectImports": false`. 6.0 turns it on by default, which makes the dev app's `import '@payloadcms/next/css'` (three files) and `import './custom.scss'` errors, since no declaration covers them in CI (`next-env.d.ts` is generated by `next dev` and git-ignored). This keeps 5.x behaviour.
- Unchanged and still right: `rootDir: "./src"` is already explicit in `tsconfig.build.json` (6.0's new default would otherwise be `.`), and `strict`, `module`, `target` and `esModuleInterop` are set explicitly.
- No `ignoreDeprecations`. If `yarn typecheck` or `yarn build` fails for a reason not listed here, block with the errors.

### 6. Vitest 5

From the Vitest 5 migration guide, the changes that touch this repo:
- `vite` is a required peer, and Yarn doesn't install peers: add `vite` 8.3.8 (`vitest` 5.1.0 accepts `^6.4.0 || ^7.0.0 || ^8.0.0`; `vite-tsconfig-paths` 6.1.1 accepts any). Node: Vitest 5 needs `>=22.12.0`, CI uses 22 (latest 22.x) and `engines` already require `^22.23.4 || >=24.22.1`.
- `clearMocks` defaults to `true`. Every spy in the suite is created and asserted inside one test (`vi.fn` / `vi.spyOn` in tests/webhook.test.ts, tests/plugin-config.test.ts, tests/int/delivery.int.test.ts), so no test should change. Keep the v5 default; if a test fails only because of it, set `clearMocks: false` in `vitest.config.js` and say so.
- Not used here (checked by grep): `vi.mock`/`vi.hoisted` inside blocks, `test.sequential`, `bench`, `expect.poll`, `VITEST_POOL_ID`/`VITEST_WORKER_ID` (the dev app names its database by process id and a random suffix), projects, coverage, browser mode.
- The JSON reporter now writes `.vitest/json/output.json` unless `--outputFile` is given; the planner's review rerun passes `--outputFile`, so it is unaffected. `.vitest/` is not created by `yarn test` (default reporter); if it appears, add it to `.gitignore`.

### 7. ESLint 9 and the lint result

ESLint 10.14.0 is held: `eslint-plugin-jsx-a11y` 6.10.2, pinned by the Payload config and itself the latest release, declares `eslint ^3 || … || ^9`; so do the pinned `eslint-plugin-import-x` 4.6.1 (`^8.57.0 || ^9.0.0`), `eslint-plugin-jest` 28.11.0, `@eslint-react/eslint-plugin` 1.31.0 and `eslint-plugin-jest-dom` 5.5.0. No newer `@payloadcms/eslint-config` exists. `yarn lint` must report no errors. typescript-eslint 8.26.1 → 8.72.2 is a minor-version range; if it reports new errors, fix them in code without changing behaviour and without turning rules off, and list each. More than 10 new errors: block.

### 8. Payload items from the batch brief

- Migrations: none. The repo has no migrations directory; the dev app uses `push: true` on SQLite. Apps that install the plugin own their migrations, and their own update plans run `payload migrate:create --skip-empty` with Payload 3.93.0 and this package installed.
- D1 upsert wrapper: not used here (no D1 adapter in this repo).
- Payload 3.92.1 → 3.93.0 release notes: security fixes (block child read access in queries, blocks restricted to each field's configured types, `pasteURL` restrictions, XSL response policy, OG endpoint clamp), `auth.passwordHashIterations`, drizzle-kit loaded lazily, and UI fixes. None changes an API the plugin calls; the forms collection uses blocks, so the full integration suite (form save, access, submit, delivery) is the proof.

### 9. README

In `## Compatibility`, replace `- Payload \`^3.92.1\` (developed and tested against 3.92.1). Payload 4 is not supported yet.` with `- Payload \`^3.92.1\` (tested against 3.93.0, with Next.js 16.4 and React 19.3 in the dev app; 0.3.0 was tested against 3.92.1). Payload 4 is not supported yet.` No other README edit; no changelog entry (no release).

### 10. Yarn's age gate

Yarn 4.18.1 refuses versions under 24 hours old (`npmMinimalAgeGate` 1 day). At planning time three targets were younger: `vite` 8.3.8 (published 11 Nov 02:49 UTC), `minimatch` 11.0.8 (09:50 UTC) and `prettier` 3.10.0 (12:30 UTC); all pass the gate from 12 Nov 12:30 UTC. The card starts after that. Never set `YARN_NPM_MINIMAL_AGE_GATE` or `npmMinimalAgeGate` (that exception is for Kairos's own packages only). If `yarn install` still stops with YN0016, block.

## Research

- **Registry, 11 Nov 2026** (`npm view <pkg> version|versions|peerDependencies|engines|dependencies|time`): every row of the Versions table, plus `payload@3.93.0` (engines `^22.23.4 || >=24.22.1`, peer `graphql ^16.8.1`, `deepmerge 4.3.1`, `file-type 21.3.4`), `@payloadcms/next@3.93.0` (peer `next >=15.2.9 <15.3.0 || … || >=16.3.3 <17.0.0`, `payload 3.93.0`), `@payloadcms/ui@3.93.0` (react peers above), `@payloadcms/db-sqlite@3.93.0` (`drizzle-kit 0.31.7`), `typescript-eslint@8.72.2` (peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`), `vitest@5.1.0` (peer `vite`, engines), `@esbuild-kit/core-utils` (latest 3.3.2, deprecated), `minimatch` (versions and dates), `deepmerge` (latest 4.3.1), `payload-dynamic-forms` (versions `["0.3.0"]`, peer `payload ^3.92.1`).
- **Package source read from tarballs** (`npm pack` into `$TMPDIR`): minimatch call sites in `@swc/cli` 0.8.2, `@typescript-eslint/typescript-estree` 8.26.1 and 8.72.2, `eslint-plugin-import-x` 4.6.1 (`makeRe` only in `lib/rules/no-internal-modules.js`), `eslint-plugin-perfectionist` 3.9.1; `@payloadcms/eslint-config` 3.28.0 `index.mjs` (enabled import-x rules); `@esbuild-kit/core-utils` 3.3.2 (`transform`, `transformSync` only); `typescript@7.0.2`'s manifest: its `.` export is `./lib/version.cjs` and the compiler API is under `./unstable/*`, so `ts.createSourceFile` (used by tests/workers-safe.test.ts), typescript-eslint and `@swc-node/register` (peer `typescript <7`) can't run on it. TypeScript 7 held on that evidence.
- **Release notes and guides:** Payload v3.93.0 release (github.com/payloadcms/payload/releases/tag/v3.93.0); Next.js v16.4.6 release (backports: route handler compression, Turbopack GC; no upgrade guide within 16.x); TypeScript 6.0 announcement (devblogs.microsoft.com/typescript/announcing-typescript-6-0/); Vitest 5 migration guide (vitest.dev/guide/migration/); minimatch changelog (github.com/isaacs/minimatch, `changelog.md`, 11.0 section); `@swc/cli` CHANGELOG (0.7: chokidar 4; 0.8: chokidar 5, optional peer, watch mode only; 0.8.1: bin-wrapper 14); Yarn manifest docs for `resolutions` (yarnpkg.com/configuration/manifest#resolutions: `name`, `parent/name` and `parent@range/name` keys).
- **Options for the transitive fixes:** (a) wait for upstream (`drizzle-kit` is pinned by Payload and `@esbuild-kit/*` is abandoned; minimatch 9/10 have no backport) — leaves criticals' neighbours open, rejected; (b) `yarn up -R` refresh — can't move a package past its parent's range, so it fixes none of these; (c) scoped `resolutions` — picked; each line is checked by a test or the audit.
- **Options for the release:** none (picked, design 2), 0.3.1 with a raised floor, 0.3.1 unchanged.
- **Limits stated here:** "TypeScript 7 has no classic compiler API" is from 7.0.2's `exports` map, not from running it. "typescript-eslint keeps new rules out of `recommended` within a major" is not checked; design 7 caps the risk.

## Versions

| Package | Current | Target | Why |
|---|---|---|---|
| `payload` | 3.92.1 | 3.93.0 | High advisory; latest |
| `@payloadcms/db-sqlite`, `@payloadcms/next`, `@payloadcms/ui` | 3.92.1 | 3.93.0 | One Payload version; `@payloadcms/next` moderate advisory |
| `@payloadcms/eslint-config` | 3.28.0 | 3.28.0 | Latest published; its pins lifted by design 4 |
| `next` | 16.3.3 | 16.4.6 | Critical advisory (fixed in 16.4.5); latest; `@payloadcms/next` peer `>=16.3.3 <17` |
| `eslint-config-next` | 16.3.3 | 16.4.6 | Same as `next` (not used by `eslint.config.js`) |
| `react`, `react-dom` | 19.2.6 | 19.3.1 | Latest; accepted by Next.js 16.4.6 and `@payloadcms/ui` 3.93.0 (design 1) |
| `@types/react`, `@types/react-dom` | 19.2.14, 19.2.3 | 19.3.0 | Latest; React 19.3 |
| `vitest` | 4.0.18 | 5.1.0 | Critical advisory (fixed in 4.1.11) and `@vitest/mocker`; latest major (design 6) |
| `vite` (new) | 7.3.7, via vitest 4 | 8.3.8 | Vitest 5 peer; Yarn installs no peers |
| `vite-tsconfig-paths` | 6.0.5 | 6.1.1 | Latest |
| `typescript` | 5.7.3 | 6.0.3 | Newest that typescript-eslint supports; 7.0.2 held (Research) |
| `eslint` | ^9.23.0 (9.39.5) | ^9.39.5 | 10.14.0 held (design 7) |
| `@eslint/eslintrc` | ^3.2.0 (3.3.7) | ^3.3.7 | Latest |
| `prettier` | ^3.4.2 (3.9.10) | ^3.10.0 | Latest |
| `@fission-ai/openspec` | 1.16.0 | 1.17.0 | Latest; engines `>=22.12.0` |
| `@swc/cli` | 0.6.0 | 0.8.2 | Latest; clears `file-type` 20 (design 4) |
| `@swc/core` | 1.15.47 | 1.16.22 | Latest |
| `@swc-node/register` | 1.10.9 | 1.12.1 | Latest |
| `@types/node` | 22.19.9 | 22.20.5 | Newest 22.x; the package supports Node 22 (`engines`), so 26.x types would allow APIs Node 22 lacks |
| `cross-env` | ^7.0.3 | ^10.1.0 | Latest major: ESM, Node >= 20; `cross-env VAR=x cmd` unchanged |
| `graphql` | ^16.8.1 (16.15.0) | ^16.15.0 | 17.1.0 held: `payload` and `@payloadcms/next` 3.93.0 peer `^16.8.1` |
| `open` | ^10.1.0 | ^11.0.4 | Latest major (Node >= 20); not called by any script |
| `qs-esm` | 8.0.1 | 8.0.2 | Latest; not imported here (Payload pins its own 8.0.1) |
| `rimraf` | 3.0.2 | 6.1.4 | Latest major; `rimraf dist tsconfig.build.tsbuildinfo` passes literal paths, unaffected by v4's glob change |
| `sort-package-json` | ^2.10.0 | ^4.1.0 | Latest major (Node >= 22); not called by any script |
| `standardwebhooks` | 1.1.1 | 1.1.1 | Latest |
| `yaml` | 2.8.1 | 2.9.1 | Moderate advisory (fixed in 2.8.3); latest |
| `peerDependencies.payload` | ^3.92.1 | ^3.92.1 | Accepts 3.93.0 (design 2) |
| `version` | 0.3.0 | 0.3.0 | No release (design 2) |

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

Remaining: `deepmerge` 4.3.1 (prototype poisoning in `mergeObject()`). No fixed release exists (latest on npm is 4.3.1) and `payload` 3.93.0 depends on exactly 4.3.1. Here it runs only in tests and the dev app. The package doesn't ship it; apps carry it through their own Payload. Re-check when Payload or deepmerge release a fix. An advisory published after 11 Nov 2026 is reported in the builder's summary, not fixed in this change.

## Breaking changes that touch this repo

| Upgrade | Change | Where it touches | Task |
|---|---|---|---|
| TypeScript 6 | `baseUrl` deprecated | `tsconfig.json` | 2.1 |
| TypeScript 6 | `types` defaults to `[]` | Node globals in tests and the dev app | 2.1 |
| TypeScript 6 | `noUncheckedSideEffectImports` on by default | dev app CSS imports | 2.1 |
| TypeScript 6 | `rootDir` defaults to `.` | none: `tsconfig.build.json` sets `./src` (`dist/` layout checked) | 2.1 |
| Vitest 5 | `vite` is a peer | `package.json` | 1.1 |
| Vitest 5 | `clearMocks` on by default | none expected (design 6) | 3.1 |
| minimatch 11 (resolution) | `makeRe`, `regexp`, `AST` removed | not on any enabled path (design 4) | 1.1, 4.1 |
| esbuild 0.25 (resolution) | 0.18 → 0.25 under core-utils | `transform`/`transformSync` only | 1.1 |
| ESLint 9.22 → 9.39, typescript-eslint 8.26 → 8.72 (resolutions) | minor releases | lint result | 4.1 |
| `@swc/cli` 0.8 | chokidar 5, bin-wrapper 14 | `build:swc` command unchanged | 6.1 |
| `rimraf` 6, `cross-env` 10 | ESM, Node >= 20; rimraf no globs by default | `clean`, `dev:payload`, `spec:validate` scripts, literal args | 6.1 |
| Payload 3.93.0 | block access and block-type checks | forms collection blocks | 3.1, 6.1 |
| Next.js 16.4, React 19.3 | minor releases | dev app only; `examples/minimal-form.tsx` typecheck | 6.1 |

## Risks / Trade-offs

- Forcing minimatch 11 on tools that ask for 9 or 10 is outside their declared ranges. Mitigation: the call sites were read (design 4); lint and build run every enabled path. If a later tool update needs a removed API, the resolution line goes.
- Holding ESLint at 9 leaves the lint toolchain one major behind. ESLint 9 is still published with fixes (9.39.5, July 2026). Moving needs a lint config other than Payload's; out of scope.
- The peer floor 3.92.1 is no longer exercised by this repo's tests (design 3).
