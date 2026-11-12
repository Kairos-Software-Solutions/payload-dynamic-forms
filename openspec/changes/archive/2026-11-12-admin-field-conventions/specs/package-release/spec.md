## MODIFIED Requirements

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
- **THEN** the first entry under `## Changelog` starts with `0.4.0` and a later one with `0.3.0`; the Migrations section has a 0.4.0 paragraph naming `prefill_from_key`, `presentation_mode` and `payload generate:importmap`, saying 0.3.0 questions keep their prefill parameter, warning that on SQLite and D1 the generated migration rebuilds the forms table and loses its child rows so those sites hand-write `ADD COLUMN prefill_from_key` (keeping the generated snapshot JSON), saying updates that resend `sections` without row ids reset the lock and overwrite a custom prefill parameter, and giving the rollback, and its 0.3.0 paragraph that names the `_locales` table and says to copy the old subject and body values, the Compatibility section says to use 0.3.0 or later, and the Rendering section shows `draft: true`
- **CHECK** tests/readme.test.ts › "readme has the 0.3.0 changelog and migration note"; tests/readme.test.ts › "readme has the 0.4.0 changelog and migration note"

#### Scenario: README uses the package name
- **WHEN** the test reads the README and `package.json`
- **THEN** the README's title and its npm, yarn and pnpm install lines use the `name` from `package.json`, and the README never mentions an earlier package name
- **CHECK** tests/readme.test.ts › "readme uses the package name from package.json"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.4.0, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, peer dependencies `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1` and no others, and Payload 3.92.1's Node engines (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peers are exactly `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`, `publishConfig` equals `{ access: 'public' }` and the version is 0.4.0
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
