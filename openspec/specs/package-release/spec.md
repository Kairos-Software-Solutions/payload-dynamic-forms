# package-release Specification

## Purpose
What makes the plugin installable and maintainable as a public npm package: its docs, licence, the files it ships, CI on every push, and a release workflow on `main` that publishes each new version, as Kairos's `kairos-design` package does.

## Requirements

### Requirement: README
The README SHALL cover: what the plugin does and doesn't do (no visitor UI), install from public npm, the one-call setup with every option, the storage plugin order for attachments on R2, migrations with each version's note and the import-map step, switching off, a rendering example, the draft read, the WhatsApp note, delivery after the reply, the endpoints, the tested Payload range and a changelog. It SHALL name no client; its title and install commands SHALL use the `package.json` name.

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
- **THEN** the first entry under `## Changelog` starts with `0.5.0`, later ones with `0.4.0` and then `0.3.0`; the Migrations section keeps its 0.4.0 paragraph (naming `prefill_from_key`, `presentation_mode` and `payload generate:importmap`, the hand-written `ADD COLUMN prefill_from_key` for SQLite and D1 with the snapshot JSON, updates without row ids, the rollback) and its 0.3.0 paragraph that names the `_locales` table and says to copy the old subject and body values; the Compatibility section says to use 0.3.0 or later, and the Rendering section shows `draft: true`
- **CHECK** tests/readme.test.ts › "readme has the 0.3.0 changelog and migration note"; tests/readme.test.ts › "readme has the 0.4.0 changelog and migration note"

#### Scenario: README uses the package name
- **WHEN** the test reads the README and `package.json`
- **THEN** the README's title and its npm, yarn and pnpm install lines use the `name` from `package.json`, and the README never mentions an earlier package name
- **CHECK** tests/readme.test.ts › "readme uses the package name from package.json"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.5.0, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, peer dependencies `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1` and no others, Payload's Node engines (`^22.23.4 || >=24.22.1`) and one exact Payload devDependency version.

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peers are exactly `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`, `publishConfig` equals `{ access: 'public' }`, the version is 0.5.0, the engines are `^22.23.4 || >=24.22.1`, and `payload` and every `@payloadcms/*` devDependency except `@payloadcms/eslint-config` have the same exact version
- **CHECK** tests/package.test.ts › "package metadata and licence agree"

### Requirement: Package contents
The published package SHALL contain only the built `dist/` files, `README.md`, `LICENSE` and `package.json`: no `src/`, `dev/`, `tests/`, `examples/`, `openspec/` or `input/`. The top-level `main`, `types` and `exports` of `package.json` SHALL point at `dist/`, with `types` first in each export, because `npm publish` ships them as written and applies no `publishConfig` field to them.

#### Scenario: Pack lists only shipped files
- **WHEN** `npm pack --dry-run --json` runs after `yarn build`
- **THEN** every listed path is `package.json`, `README.md`, `LICENSE` or under `dist/`
- **CHECK** `yarn build && npm pack --dry-run --json | node -e "const f=JSON.parse(require('fs').readFileSync(0))[0].files.map(x=>x.path);const bad=f.filter(p=>!/^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(p));if(bad.length){console.error(bad);process.exit(1)}console.log('ok',f.length)"` prints `ok`

#### Scenario: Entry fields point at dist
- **WHEN** the test reads `package.json`
- **THEN** `main` is `./dist/index.js`, `types` is `./dist/index.d.ts`, `exports` has exactly `.`, `./shared` and `./client`, each with keys `types`, `import`, `default` in that order and every target under `./dist/`, nothing names `./src/`, and `publishConfig` has no `main`, `types` or `exports`
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
`yarn check:packed` SHALL `npm pack` the package and refuse a manifest whose `main`, `types` or any `exports` target is not in the tarball. It SHALL install it with `payload`, `@payloadcms/ui` and `react` in a scratch ESM app outside the repo, import `payload-dynamic-forms` and `payload-dynamic-forms/shared` by name, resolve `payload-dynamic-forms/client` without running it, typecheck all three, and remove the app. Given a tarball path, it SHALL check that tarball instead.

#### Scenario: Built package installs and imports by name
- **WHEN** `yarn build` has run and `yarn check:packed` runs
- **THEN** the main and shared entries import by name and the client entry resolves, all to files under `node_modules/payload-dynamic-forms/dist/`, the scratch app's `tsc` finds the types of all three, and the script prints one line starting `ok` that names a scratch dir under the OS temp dir, which no longer exists afterwards
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints `ok <n> files, 3 entries resolve, types resolve (<dir>)`; `test -e <dir>` then fails

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

### Requirement: README notes for 0.5.0
The README SHALL carry a 0.5.0 migration note (new columns, the default-language copy with `carryOverDefault` and its report file, the backfill, hand-written SQLite/D1 migration, the Postgres edit, import map, rollback through `down()` with `rollbackDefault`), the `timezone` and `metadata.timeZone` options, date modes and storage, jumps vs show rules, and Send another with the Turnstile note.

#### Scenario: 0.5.0 migration note
- **WHEN** the test reads the Migrations section's `**0.5.0.**` paragraph
- **THEN** it names `default_value`, `_locales`, `mode`, `value_format`, `display_style`, `send_another`, `wording_send_another`, `metadata_time_zone`, `carryOverDefault`, `forms-0.5.0-carry-over.txt`, `rollbackDefault`, `ADD COLUMN`, `snapshot JSON` and `payload generate:importmap`, says SQLite and D1 sites hand-write the migration because a generated one can rebuild tables and delete child rows, says Postgres runs the copy before the generated `DROP COLUMN`, says defaults that don't fit are reported, says existing rows are backfilled (`dayOnly`, `send_another`, the Send another words per locale), and gives the Rollback: run `down()` before re-pinning 0.4.0, because a 0.5.0 save clears the old `_locales` default
- **CHECK** tests/readme.test.ts › "readme has the 0.5.0 changelog and migration note"

#### Scenario: Date modes, jumps and send another are explained
- **WHEN** the test reads the README
- **THEN** it has sections "Date and time questions" (naming Date, Date and time, Time, `dayOnly`, `dayAndTime`, `timeOnly`, `TIME_ZONE_FIELD`, `_tz`, `timezone` and that date-only answers are never converted to UTC), "Jumps and show rules" (saying a jump skips every section in between and to use a show rule for an optional section) and "Send another" (saying Turnstile tokens are single use and the renderer needs a fresh one), and the Options section documents `timezone` with its `UTC` default and `metadata.timeZone` (default on, the zone still used when off)
- **CHECK** tests/readme.test.ts › "readme explains date modes, jumps and send another"

### Requirement: Peer ranges accept the current stack
The `payload` and `@payloadcms/ui` peer ranges SHALL accept the exact Payload version the repo develops and tests against, and the `react` peer range the exact React version, so apps on that Payload, Next.js 16.4 and React 19.3 can keep the published version. Runtime code SHALL import no package besides its declared peers and `node:buffer`, so the package needs no Next.js peer.

#### Scenario: Dev Payload and React versions are inside the peer ranges
- **WHEN** the test reads `package.json`
- **THEN** the `payload` devDependency is an exact version with the same major as the `payload` and `@payloadcms/ui` peer ranges and not below their floor 3.92.1, and the `react` devDependency is an exact version with the same major as the `react` peer range and not below its floor 19.2.1
- **CHECK** tests/package.test.ts › "package › peer ranges accept the dev payload and react versions"

#### Scenario: Runtime code imports only declared peers
- **WHEN** the test reads every import and re-export in the `.ts` and `.tsx` files under `src/`
- **THEN** each one is relative, `node:buffer`, or `payload`, `@payloadcms/ui` or `react` or a subpath of one of them; each of those three names is a key of `peerDependencies`; and none is `next` or a `next/` subpath
- **CHECK** tests/package.test.ts › "package › src imports only declared peers"

#### Scenario: Packed package installs with the dev versions
- **WHEN** `yarn build && yarn check:packed` runs with `payload` and `@payloadcms/ui` 3.93.0, `react` 19.3.1 and `typescript` 6.0.3 as devDependencies
- **THEN** the scratch app installs the tarball with `payload@3.93.0`, `@payloadcms/ui@3.93.0`, `react@19.3.1` and `typescript@6.0.3`, the main and shared entries import by name, the client entry resolves, and all three typecheck
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints `ok <n> files, 3 entries resolve, types resolve (<dir>)`

### Requirement: Lockfile clear of the November 2026 advisories
The lockfile SHALL resolve no version below the fix of an advisory listed on 11 November 2026: next 16.4.5, vitest 4.1.11, @vitest/mocker 4.1.12, payload and @payloadcms/next 3.93.0, esbuild 0.25.0, file-type 21.3.2, yaml 2.8.3 (2.x), @eslint/plugin-kit 0.3.4, and no minimatch 9.x or 10.x. deepmerge 4.3.1 stays: no fixed release exists. Transitive fixes SHALL use Yarn `resolutions`.

#### Scenario: Lockfile is clear of the listed versions
- **WHEN** the test reads every resolved entry in `yarn.lock`
- **THEN** none is a listed package below its fixed version, no minimatch is 9.x or 10.x, and deepmerge, if present, is 4.3.1
- **CHECK** tests/dependencies.test.ts › "dependencies › lockfile has no version from the November 2026 advisories"

#### Scenario: Audit shows only the unfixed advisory
- **WHEN** `yarn npm audit --all --recursive --no-deprecations` runs after the install
- **THEN** it reports no advisory for next, vitest, @vitest/mocker, payload, @payloadcms/next, esbuild, file-type, minimatch, yaml or @eslint/plugin-kit; from the list, only deepmerge remains
- **CHECK** `yarn npm audit --all --recursive --no-deprecations --json` names none of those ten packages; any other advisory it names is listed in the builder's summary

#### Scenario: drizzle-kit's TypeScript loader runs on the lifted esbuild
- **WHEN** the test loads `@esbuild-kit/core-utils` from where `@esbuild-kit/esm-loader` resolves it and transforms `const a: number = 1` as `a.ts`
- **THEN** the output code is `const a = 1;` and the `esbuild` that core-utils resolves is 0.25.0 or later
- **CHECK** tests/dependencies.test.ts › "dependencies › esbuild-kit transforms TypeScript on the lifted esbuild"

### Requirement: Development toolchain
The repo SHALL type-check on TypeScript 6 with no deprecated option and no `ignoreDeprecations`, test on Vitest 5 with `vite` listed as a devDependency because Yarn installs no peers, and lint on ESLint 9 with a single `eslint` and a single `typescript` in the lockfile, matching the devDependencies.

#### Scenario: TypeScript 6 without deprecations
- **WHEN** `yarn typecheck` and `yarn build` run on TypeScript 6
- **THEN** both pass, neither tsconfig has `baseUrl` or `ignoreDeprecations`, and the built files of all three entries keep their paths
- **CHECK** `yarn typecheck && yarn build` exits 0; `grep -cE 'baseUrl|ignoreDeprecations' tsconfig.json tsconfig.build.json` prints 0 for both; `ls dist/index.js dist/index.d.ts dist/exports/shared.js dist/exports/shared.d.ts dist/exports/client.js dist/exports/client.d.ts` exits 0

#### Scenario: Vitest 5 with vite declared
- **WHEN** `yarn vitest --version` runs
- **THEN** it reports Vitest 5.1.0, and `package.json` lists `vite` in devDependencies
- **CHECK** `yarn vitest --version` prints a line containing `5.1.0`; `node -p "require('./package.json').devDependencies.vite"` prints `8.3.8`

#### Scenario: One ESLint and one TypeScript
- **WHEN** the test reads `yarn.lock` and `package.json`
- **THEN** every `eslint` entry resolves to the `eslint` devDependency's version and every `typescript` entry (npm and Yarn's compat patch) to the `typescript` devDependency's version
- **CHECK** tests/dependencies.test.ts › "dependencies › lockfile resolves one eslint and one typescript"

### Requirement: README names the tested Payload version
The README's Compatibility section SHALL name the exact `payload` version the tests run on, next to the peer range, so readers see both.

#### Scenario: Compatibility names the dev Payload version
- **WHEN** the test reads the README and `package.json`
- **THEN** the Compatibility section contains `^3.92.1` and the `payload` devDependency's version
- **CHECK** tests/readme.test.ts › "README › compatibility names the payload version the tests run on"
