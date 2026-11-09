## Why

No app can import the published 0.1.0 or 0.2.0. Their manifests on npm say `main`, `types` and both `exports` entries are `./src/*.ts`, but the tarball holds only `dist/`, `README.md`, `LICENSE` and `package.json`. The repo keeps the `./src` paths at the top level of `package.json` and the `dist/` paths only under `publishConfig`. `npm publish` doesn't apply `publishConfig.main`, `types` or `exports` (pnpm does, and Yarn applies `main` and `exports`), and the release publishes with `npm publish`. Payload's plugin template uses the same layout because Payload publishes with pnpm.

The plugin's own checks missed it. `tests/package.test.ts` reads `publishConfig`, not the manifest that ships. The "Built package exposes both entries" check imports `dist/` files by path, not the package by name.

## What Changes

- `package.json`: `main`, `types` and `exports` point at `./dist/` at the top level, with `types` first in each export. `publishConfig` holds only `access: public`. Version 0.2.1.
- The dev app and the tests keep reading `src/`. They import it by relative path, and `tsconfig.json` `paths` map the package name to `src/` for the typecheck and vitest. Nothing in dev uses the package's own `exports`.
- New `yarn check:packed` (`scripts/check-packed.mjs`). It runs `npm pack`, then checks that `main`, `types` and every `exports` target in the packed manifest are files in the tarball. It installs the tarball and `payload` into a scratch ESM app outside the repo, imports `payload-dynamic-forms` and `payload-dynamic-forms/shared` by name, and typechecks both imports. Given a tarball path, it checks that tarball instead, so it can be shown to refuse the published 0.2.0.
- CI runs `yarn check:packed` after the build. `release.yml` runs it before `npm publish`, so a manifest that doesn't import can't publish.
- README: Compatibility says to use 0.2.1 or later. Development lists the new check.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `package-release`: entry fields at the top level point at `dist/`, version 0.2.1, a packed install check in CI and before publish, dev and tests read `src/` without a build.
- `plugin-setup`: both entries are proven by importing the installed tarball by package name, not `dist/` files by path.

## Impact

- `package.json`, `scripts/check-packed.mjs` (new), `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `tests/package.test.ts`, `tests/workflows.test.ts`, `README.md`, possibly `eslint.config.js` (one lint glob for `scripts/*.mjs`).
- No runtime code in `src/` changes. Apps see the same plugin as 0.2.0, but now it can be imported.
- `yarn check:packed` needs the npm registry: it installs `payload` into the scratch app. CI and the release runner have it. `yarn test` stays offline.

## Out of scope

- Any feature. Spanish email subject and body, and the draft-preview gap, are a later 0.3.0.
- Deprecating 0.1.0 and 0.2.0 on npm. That needs an npm login. It is the reviewer's optional step after 0.2.1 is live.
- Publishing 0.2.1. The planner pushes to `main`, which publishes, after review and the reviewer's own yes at the push.
- Pinning 0.2.1 in the starter. That is the starter's own change (`dynamic-forms`), after 0.2.1 is verified on the registry.
- Changing the publish command or tool. `npm publish --access public --provenance` through trusted publishing stays as 0.2.0 proved it.
