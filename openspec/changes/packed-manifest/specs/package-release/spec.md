## ADDED Requirements

### Requirement: Packed install check
`yarn check:packed` SHALL pack the package with `npm pack` and refuse a packed manifest whose `main`, `types` or any `exports` target is not a file in the tarball. It SHALL install the tarball and `payload` into a scratch ESM app outside the repo, import `payload-dynamic-forms` and `payload-dynamic-forms/shared` by name, typecheck both imports, and remove the scratch app. Given a tarball path, it SHALL check that tarball instead of packing.

#### Scenario: Built package installs and imports by name
- **WHEN** `yarn build` has run and `yarn check:packed` runs
- **THEN** both entries import by name from the scratch app and resolve to files under `node_modules/payload-dynamic-forms/dist/`, the scratch app's `tsc` finds the types of both, and the script prints one line starting `ok` that names a scratch dir under the OS temp dir, which no longer exists afterwards
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints `ok <n> files, both entries import, types resolve (<dir>)`; `test -e <dir>` then fails

#### Scenario: Published 0.2.0 is refused
- **WHEN** the check is given the published 0.2.0 tarball (`npm pack payload-dynamic-forms@0.2.0 --pack-destination <tmp>`)
- **THEN** it exits 1 and names `main`, `types` and `exports` with their `./src/` paths as not in the tarball, before installing anything
- **CHECK** `node scripts/check-packed.mjs <tmp>/payload-dynamic-forms-0.2.0.tgz` exits 1 and its output contains `main: ./src/index.ts`, `types: ./src/index.ts` and `./src/exports/shared.ts`

### Requirement: Development reads the source
The dev app, the tests and the typecheck SHALL read `src/` and SHALL NOT need a built `dist/`. They import `src/` by relative path or through the `tsconfig.json` `paths` for the package name, never through the package's own `exports`.

#### Scenario: Typecheck and tests run without dist
- **WHEN** `dist/` is removed
- **THEN** `yarn typecheck` passes and the plugin config and dev app boot tests pass
- **CHECK** `rm -rf dist && yarn typecheck && yarn vitest run tests/plugin-config.test.ts tests/int/boot.int.test.ts` exits 0

## MODIFIED Requirements

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.2.1, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, `payload ^3.92.1` as its only peer dependency, and Payload 3.92.1's Node engines (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peer range is `^3.92.1`, `publishConfig` equals `{ access: 'public' }` and the version is 0.2.1
- **CHECK** tests/package.test.ts › "package metadata and licence agree"

### Requirement: Package contents
The published package SHALL contain only the built `dist/` files, `README.md`, `LICENSE` and `package.json`: no `src/`, `dev/`, `tests/`, `examples/`, `openspec/` or `input/`. The top-level `main`, `types` and `exports` of `package.json` SHALL point at `dist/`, with `types` first in each export, because `npm publish` ships them as written and applies no `publishConfig` field to them.

#### Scenario: Pack lists only shipped files
- **WHEN** `npm pack --dry-run --json` runs after `yarn build`
- **THEN** every listed path is `package.json`, `README.md`, `LICENSE` or under `dist/`
- **CHECK** `yarn build && npm pack --dry-run --json | node -e "const f=JSON.parse(require('fs').readFileSync(0))[0].files.map(x=>x.path);const bad=f.filter(p=>!/^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(p));if(bad.length){console.error(bad);process.exit(1)}console.log('ok',f.length)"` prints `ok`

#### Scenario: Entry fields point at dist
- **WHEN** the test reads `package.json`
- **THEN** `main` is `./dist/index.js`, `types` is `./dist/index.d.ts`, `exports` has exactly `.` and `./shared`, each with keys `types`, `import`, `default` in that order and every target under `./dist/`, nothing names `./src/`, and `publishConfig` has no `main`, `types` or `exports`
- **CHECK** tests/package.test.ts › "entry fields point at dist and publishConfig holds only access"

### Requirement: CI on every push
A GitHub Actions workflow SHALL run on pushes and pull requests with Node 22: install with the lockfile, lint, typecheck, tests, build, OpenSpec validation, the pack check and the packed install check (`yarn check:packed`), with no secrets.

#### Scenario: CI runs every check
- **WHEN** the test parses `.github/workflows/ci.yml`
- **THEN** it triggers on push and pull_request, uses Node 22, runs `yarn install --immutable`, `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn spec:validate`, the pack check and `yarn check:packed`, and references no secret
- **CHECK** tests/workflows.test.ts › "ci runs every check without secrets"

### Requirement: Release from main, like kairos-design
Only `.github/workflows/release.yml` SHALL publish. On a push to `main`, a `v*.*.*` tag or a manual run, on Node 24, it SHALL skip a version whose tag exists, run every check including `yarn check:packed`, publish with `npm publish --access public --provenance` through npm trusted publishing, and tag only after the publish succeeds. It SHALL use no secrets: the trusted publisher is set on npmjs.com.

#### Scenario: New version from main is published, a tagged one is skipped
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** it triggers on push to `main`, on `v*.*.*` tags and on `workflow_dispatch`, uses Node 24, stops before installing when `v<version>` exists on a branch push, checks a pushed tag against the version, runs every check including `yarn check:packed` before the publish step, and runs the publish step before the step that creates and pushes the tag
- **CHECK** tests/workflows.test.ts › "release publishes a new version from main and skips a tagged one"

#### Scenario: Trusted publishing, token only for the first publish
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** permissions are `contents: write` and `id-token: write`, the publish command is `npm publish --access public --provenance`, the publish step has no `env`, the text contains no `secrets.` and no `NPM_TOKEN`, setup-node sets `registry-url: https://registry.npmjs.org`, and no job sets `environment`
- **CHECK** tests/workflows.test.ts › "release uses trusted publishing with no secrets"

#### Scenario: Nothing else publishes
- **WHEN** the test reads every file under `.github/workflows/`
- **THEN** only `release.yml` contains `npm publish`, and `publish.yml` no longer exists
- **CHECK** tests/workflows.test.ts › "only release.yml publishes"
