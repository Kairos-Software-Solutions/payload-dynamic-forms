## Context

0.1.0 and 0.2.0 were scaffolded from Payload's plugin template, which keeps `main`, `types` and `exports` at `./src/*.ts` and puts the `./dist/*` paths under `publishConfig`. The template relies on `pnpm publish` to swap them in. This repo publishes with `npm publish` (`.github/workflows/release.yml`, trusted publishing), which ships the top-level fields as written. The planner checked the registry on 9 Nov 2026: 0.1.0 and 0.2.0 both list `main`/`types` `./src/index.ts` and `exports` `./src/*.ts`, with 99 files in `dist/` only. So `import 'payload-dynamic-forms'` fails in every app.

What reads the package today, in this repo:

- `dev/payload.config.ts` imports `../src/index.js` by relative path.
- Every test imports `../src/...` or `../../src/...` by relative path.
- `examples/minimal-form.tsx` imports `payload-dynamic-forms/shared` by name. Only the typecheck reads it, and `tsconfig.json` `paths` map both package names to `src/`. vitest gets the same mapping through `vite-tsconfig-paths`.
- `dev/app/(payload)/admin/importMap.js` is empty: the package ships no admin components.

So nothing in dev or tests resolves the package through its own `exports`.

## Goals / Non-Goals

**Goals:** the published manifest points at files in the tarball. Both entries import by name in a plain ESM app and their types resolve. A broken manifest fails CI and stops the release before `npm publish`. Dev and tests keep reading `src/` with no build step.

**Non-Goals:** features (0.3.0), changing the publish tool or command, deprecating old versions (the reviewer's optional step), CommonJS support (0.2.0 was ESM-only by design).

## Research

- **Payload's plugin template** (`templates/plugin/package.json` on `main`, read 9 Nov 2026, https://github.com/payloadcms/payload/blob/main/templates/plugin/package.json) has top-level `exports`/`main`/`types` at `./src/*.ts` and the `./dist/*` versions under `publishConfig`. Its scripts and `engines` use pnpm. Payload's own packages use the same layout, e.g. `packages/plugin-seo/package.json`. Payload releases with pnpm (root `package.json`: `release-ci` runs `pnpm --filter releaser`). The published `@payloadcms/plugin-seo@3.92.1` manifest has `main` `./dist/index.js` and `exports` at `./dist/`, so pnpm's publish applies the swap.
- **npm** (https://docs.npmjs.com/cli/v10/configuring-npm/package-json#publishconfig): `publishConfig` is "a set of config values that will be used at publish-time", and points to the `config` page for what can be overridden (`registry`, `tag`, `access`, `provenance`…). It names no manifest fields. The registry shows the result: 0.1.0 and 0.2.0 kept `./src` paths and also carry the unused `publishConfig` block.
- **pnpm** (https://pnpm.io/package_json#publishconfig) lists `main`, `exports`, `types`/`typings`, `module`, `bin` and others as fields `publishConfig` overrides before packing.
- **Yarn 4**: its manifest docs list `publishConfig.main`, `module`, `bin`, `browser` and `type` (https://yarnpkg.com/configuration/manifest#publishConfig). Its pack plugin also copies `exports` and `imports`, but not `types` (`packages/plugin-pack/sources/index.ts`, `beforeWorkspacePacking`; docs gap tracked in yarnpkg/berry#6243).
- **npm trusted publishing** needs npm CLI 11.5.1 or later (https://docs.npmjs.com/trusted-publishers/). pnpm hands publishing to the npm CLI for OIDC (pnpm/pnpm#9812). 0.2.0's run 42632529954 proved `npm publish` with OIDC on this repo.
- **Node conditions** (https://nodejs.org/api/packages.html, "Conditional exports", "Community Conditions Definitions"): `types` "should always be included first". User conditions such as `development` can be enabled with `--conditions`. Bundlers enable `development` themselves in dev mode, so a `development` target pointing at files not in the tarball would break apps in `next dev`.
- **TypeScript `paths`** are applied before `node_modules` lookup, so `tsconfig.json` keeps mapping the package name to `src/`. Not checked here: whether `paths` also wins over TypeScript's self-name lookup through the package's own `exports` under `moduleResolution: nodenext`. No TypeScript is installed on the planner's host. The scenario "Typecheck and tests run without dist" proves it in the sandbox.
- **Options weighed:**
    - (a) **Top-level `main`/`types`/`exports` at `./dist/`; `publishConfig` keeps only `access`.** The repo's manifest is the one that ships, so a reader, a test and the registry see the same thing. Dev and tests don't use the package's `exports` (Context), and `tsconfig` `paths` keep the typecheck on `src/`. One kind of edit, no new tooling. **Picked.**
    - (b) **A custom export condition** (`"payload-dynamic-forms:source": "./src/index.ts"` first in each export), turned on through vitest `resolve.conditions`, TypeScript `customConditions` and Next's config. The published manifest would then name `src/` files the tarball doesn't hold. That's harmless to apps, but it's the same mismatch this fix removes, and the packed check would need an exception for it. Nothing in this repo imports the package by name at runtime, so the condition buys nothing. Using the `development` name instead would break apps in dev mode (Research › Node conditions).
    - (c) **Keep the template layout and publish with pnpm or Yarn.** That would mean pnpm next to Yarn 4 and npm 11.5.1+ for OIDC (pnpm/pnpm#9812), or `yarn npm publish`, which doesn't copy `types`. It would also change the publish path that 0.2.0 just proved. And the repo's manifest would still differ from the shipped one, which is how this bug went unseen.
    - (d) **A `prepack` script that rewrites `package.json`** (clean-package style). It edits the working tree during pack and leaves a dirty file if pack fails, for no gain over (a).
- **Kairos's earlier package:** `kairos-design` publishes with `npm publish` too, so (a) matches the publish path Kairos already uses.

## Decisions

1. **Manifest (option a).** Top level:
    - `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`.
    - `"exports"`: `"."` → `{ "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }` and `"./shared"` → `{ "types": "./dist/exports/shared.d.ts", "import": "./dist/exports/shared.js", "default": "./dist/exports/shared.js" }`.
    - `types` comes first in each entry (Node docs). `"publishConfig": { "access": "public" }` and nothing else. `files` stays `["dist"]`. Field order otherwise unchanged.
2. **Dev and tests stay on `src/`.** No change to `tsconfig.json` `paths`, `vitest.config.js`, `dev/` or test imports. If `rm -rf dist && yarn typecheck` fails because TypeScript resolves the self-name through `exports` to the missing `dist/`, that is the one case to block on. Report the error. Don't add a condition or a path. If a later version adds admin components, the dev app's import map resolves `payload-dynamic-forms/<entry>` through `tsconfig` `paths`, so that change adds a `paths` entry. Nothing to do now.
3. **`scripts/check-packed.mjs`, run as `yarn check:packed`.** Plain Node ESM, stdlib only (`node:child_process`, `node:fs`, `node:os`, `node:path`), no new dependency. Steps:
    1. With no argument: `npm pack --json --pack-destination <scratch>`, run in the repo, after `yarn build`. With a `.tgz` path argument, skip packing and use that tarball.
    2. List the tarball's files (`tar -tzf`) and read `package/package.json` from it (`tar -xzf … package/package.json -O`).
    3. Check that `main`, `types` and every string target in `exports` (walked through nested conditions) is a file in the tarball. A target that is missing, under `./src/`, or ending in `.ts` but not `.d.ts` is an error that names the field and the path (`main: ./src/index.ts is not in the tarball`). Print every error, then exit 1.
    4. Make a scratch app with `fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-packed-'))`, which is outside the repo. Its `package.json` is `{ "name": "packed-check", "private": true, "type": "module" }`.
    5. Install with `npm install <tarball> payload@<the devDependency version of payload> typescript@<the devDependency version of typescript> --no-audit --no-fund --ignore-scripts --registry=https://registry.npmjs.org/`, with env `NPM_CONFIG_USERCONFIG` set to an empty file in the scratch dir. In the release job, setup-node's `.npmrc` sends a placeholder auth token, and an empty user config keeps it out of a public install. If importing `payload` fails only because `--ignore-scripts` skipped an install script, drop the flag and say so in the summary.
    6. In the scratch dir, `node --input-type=module -e` imports `payload-dynamic-forms` and `payload-dynamic-forms/shared` by name. It checks `formsPlugin`, `formBlock` and `getPublicForm` on the first, and `evaluateRules`, `buildWhatsAppMessage`, `whatsappUrl`, `interpolate` and `DEFAULT_WORDS` on the second. It also checks that `import.meta.resolve` of each entry ends in `/node_modules/payload-dynamic-forms/dist/index.js` and `/node_modules/payload-dynamic-forms/dist/exports/shared.js`.
    7. Write `check.ts` (`import { formsPlugin } from 'payload-dynamic-forms'`, `import { evaluateRules } from 'payload-dynamic-forms/shared'`, both used) and a `tsconfig.json` (`module`/`moduleResolution` `nodenext`, `strict`, `skipLibCheck`, `noEmit`), then run the scratch app's `tsc -p .`. A missing declaration is an error under `strict` (TS7016), so this proves `types` resolve for both entries.
    8. Remove the scratch dir and the packed `.tgz` it made, also on failure (`finally`). On success, print one line: `ok <file count> files, both entries import, types resolve (<scratch dir>)`.
4. **Negative proof against the real broken release.** `npm pack payload-dynamic-forms@0.2.0 --pack-destination <tmp>` downloads the published 0.2.0 tarball. Then `node scripts/check-packed.mjs <that .tgz>` must exit 1 and name `main`, `types` and `exports` with their `./src/` paths. The builder runs this once, as task 2.1's check. It is not a CI step, because it depends on an old release staying on the registry.
5. **Where it runs.**
    - In `ci.yml` and `release.yml`, as a new step `Packed install check` (`run: yarn check:packed`) right after the existing `Pack check`.
    - In `release.yml` it carries the same `if: steps.release.outputs.publish == 'true'` as the other check steps. It comes before `Publish`, so a failure stops the release before anything reaches npm and leaves no tag.
    - `tests/workflows.test.ts` adds `'yarn check:packed'` to its `CHECKS` list. That makes the CI test and the release order test (every check before publish) require it.
    - The existing dry-run `Pack check` stays as it is (file list only).
6. **Publish stays `npm publish --access public --provenance` from the repo folder,** not `npm publish <checked .tgz>`. Both pack the same built tree, and npm applies no `publishConfig` field to the manifest, so the published manifest equals the checked one. Changing the command would also change the token-free publish path that 0.2.0 proved, and its scenario.
7. **`yarn test` stays offline.** The packed check needs the registry, so it is a script, not a vitest test. The offline guard for the manifest is a unit test on `package.json`: top-level fields at `./dist/`, `publishConfig` equal to `{ access: 'public' }`.
8. **Lint.** `eslint.config.js` lints `.mjs` files through `allowDefaultProject`, which lists root `*.mjs` and `scripts/*.ts`. If `yarn lint` reports `scripts/check-packed.mjs` as not in a project, add `'scripts/*.mjs'` to `allowDefaultProject`. No other lint change.
9. **Version 0.2.1.** A patch: packaging only, no API change. The package-release requirement "Licence and package metadata" names the version and `publishConfig`, so it is modified here. A grep of `openspec/specs` for `0.2.0`, `publishConfig` and `dist/` found that requirement plus "Package contents" (exports at `dist/`), "CI on every push" and "Release from main, like kairos-design" (the checks list) in package-release, and "Package entry points" (`dist/` imported by path) in plugin-setup. All five are modified.
10. **README.**
    - Compatibility gets one line: use 0.2.1 or later, because 0.1.0 and 0.2.0 were published with entry points at files the package doesn't contain.
    - Development's command block gets `yarn build && yarn check:packed` with a short comment (packs, installs outside the repo, imports both entries; needs the npm registry).
    - The "Releasing" paragraph says the release also runs the packed install check before publishing.
    - No other README edits.

## Payload plugins

Not applicable: this is a plugin package, not a site.

## Content model

Not applicable: no visitor-facing words change.

## Risks / Trade-offs

- **The check needs the npm registry** and takes some time to install `payload` and `typescript` (not measured; expect under a minute or two on a GitHub runner). A registry outage fails CI and holds the release. That is acceptable: the release itself needs the registry anyway.
- **`payload` imported in plain Node.** The check imports the server entry outside Next. The current scenario "Built package exposes both entries" already imports `dist/index.js` in plain Node with the repo's own `payload`, so this is expected to work. The planner didn't rerun it for this plan.
- **Old versions stay broken on npm.** Apps pinned to `0.2.0` keep failing until they move to 0.2.1. Deprecating 0.1.0 and 0.2.0 with a message pointing at 0.2.1 is the reviewer's optional step.
