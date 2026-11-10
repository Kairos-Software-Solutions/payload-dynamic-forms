# package-release Specification

## Purpose
What makes the plugin installable and maintainable as a public npm package: its docs, licence, the files it ships, CI on every push, and a release workflow on `main` that publishes each new version, as Kairos's `kairos-design` package does.

## Requirements

### Requirement: README
The README SHALL cover: what the plugin does and doesn't do (no visitor UI), install from public npm, the one-call setup with every option, the storage plugin order for attachments on R2, migrations with each version's schema note, switching off, a rendering example, the draft read, the WhatsApp popup note, delivery after the reply, the endpoints, the tested Payload range and a changelog. It SHALL name no client; its title and install commands SHALL use the `package.json` name.

#### Scenario: Example in the README is real code
- **WHEN** the test reads the README's rendering example and `examples/minimal-form.tsx`
- **THEN** the README block equals the file, and the file passes `yarn typecheck`
- **CHECK** tests/readme.test.ts › "readme example equals examples/minimal-form.tsx"

#### Scenario: README covers the setup topics
- **WHEN** the test reads the README
- **THEN** it has sections for install, options, attachments and storage order, migrations, switching off, rendering, WhatsApp, delivery after the reply, endpoints, compatibility and changelog
- **CHECK** tests/readme.test.ts › "readme has every setup section"

#### Scenario: Changelog and 0.3.0 migration note
- **WHEN** the test reads the README
- **THEN** the first entry under `## Changelog` starts with `0.3.0`, the Migrations section has a 0.3.0 paragraph that names the `_locales` table and says to copy the old subject and body values, the Compatibility section says to use 0.3.0 or later, and the Rendering section shows `draft: true`
- **CHECK** tests/readme.test.ts › "readme has the 0.3.0 changelog and migration note"

#### Scenario: README uses the package name
- **WHEN** the test reads the README and `package.json`
- **THEN** the README's title and its npm, yarn and pnpm install lines use the `name` from `package.json`, and the README never mentions an earlier package name
- **CHECK** tests/readme.test.ts › "readme uses the package name from package.json"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.3.0, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, `payload ^3.92.1` as its only peer dependency, and Payload 3.92.1's Node engines (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peer range is `^3.92.1`, `publishConfig` equals `{ access: 'public' }` and the version is 0.3.0
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

### Requirement: Tests on the dev app
`yarn test` SHALL run the unit tests and the integration tests, which start the plugin template's dev app on SQLite with a capturing email adapter and stubbed outbound HTTP, so no test needs a network, a Cloudflare account or a secret.

#### Scenario: Suite runs offline
- **WHEN** `yarn test` runs in the sandbox
- **THEN** every unit and integration test passes, and the run makes no request outside localhost
- **CHECK** `yarn test` exits 0; tests/int/boot.int.test.ts › "integration tests make no outside requests"

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
