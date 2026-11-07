# package-release Specification

## Purpose
What makes the plugin installable and maintainable as a public npm package: its docs, licence, the files it ships, CI on every push, and a release workflow on `main` that publishes each new version, as Kairos's `kairos-design` package does.

## Requirements

### Requirement: README
The README SHALL cover: what the plugin does and does not do (no visitor UI), install with any package manager from public npm, the one-call setup with every option, the storage plugin order for attachments on R2, migrations, switching it off, a minimal rendering example, the WhatsApp popup note, delivery after the reply, the endpoints and their responses, and the tested Payload range. It SHALL name no client, and its title and install commands SHALL use the package name from `package.json`.

#### Scenario: Example in the README is real code
- **WHEN** the test reads the README's rendering example and `examples/minimal-form.tsx`
- **THEN** the README block equals the file, and the file passes `yarn typecheck`
- **CHECK** tests/readme.test.ts › "readme example equals examples/minimal-form.tsx"

#### Scenario: README covers the setup topics
- **WHEN** the test reads the README
- **THEN** it has sections for install, options, attachments and storage order, migrations, switching off, rendering, WhatsApp, delivery after the reply, endpoints and compatibility
- **CHECK** tests/readme.test.ts › "readme has every setup section"

#### Scenario: README uses the package name
- **WHEN** the test reads the README and `package.json`
- **THEN** the README's title and its npm, yarn and pnpm install lines use the `name` from `package.json`, and the README never mentions an earlier package name
- **CHECK** tests/readme.test.ts › "readme uses the package name from package.json"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.1.0, `publishConfig.access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, `payload ^3.92.1` as its only peer dependency, and Payload 3.92.1's Node engines (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peer range is `^3.92.1`, access is public and the version is 0.1.0
- **CHECK** tests/package.test.ts › "package metadata and licence agree"

### Requirement: Package contents
The published package SHALL contain only the built `dist/` files, `README.md`, `LICENSE` and `package.json`: no `src/`, `dev/`, `tests/`, `examples/`, `openspec/` or `input/`. Its exports SHALL point at `dist/`.

#### Scenario: Pack lists only shipped files
- **WHEN** `npm pack --dry-run --json` runs after `yarn build`
- **THEN** every listed path is `package.json`, `README.md`, `LICENSE` or under `dist/`
- **CHECK** `yarn build && npm pack --dry-run --json | node -e "const f=JSON.parse(require('fs').readFileSync(0))[0].files.map(x=>x.path);const bad=f.filter(p=>!/^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(p));if(bad.length){console.error(bad);process.exit(1)}console.log('ok',f.length)"` prints `ok`

### Requirement: CI on every push
A GitHub Actions workflow SHALL run on pushes and pull requests with Node 22: install with the lockfile, lint, typecheck, tests, build, OpenSpec validation and the pack check, with no secrets.

#### Scenario: CI runs every check
- **WHEN** the test parses `.github/workflows/ci.yml`
- **THEN** it triggers on push and pull_request, uses Node 22, runs `yarn install --immutable`, `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn spec:validate` and the pack check, and references no secret
- **CHECK** tests/workflows.test.ts › "ci runs every check without secrets"

### Requirement: Release from main, like kairos-design
Only `.github/workflows/release.yml` SHALL publish. On a push to `main`, a `v*.*.*` tag or a manual run, on Node 24, it SHALL skip a version whose tag exists, run every check, publish with `npm publish --access public --provenance` through npm trusted publishing, and tag only after the publish succeeds. The `NPM_TOKEN` secret SHALL reach the publish step only, for the package's first publish (npm can't trust a package that doesn't exist yet).

#### Scenario: New version from main is published, a tagged one is skipped
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** it triggers on push to `main`, on `v*.*.*` tags and on `workflow_dispatch`, uses Node 24, stops before installing when `v<version>` exists on a branch push, checks a pushed tag against the version, and runs the publish step before the step that creates and pushes the tag
- **CHECK** tests/workflows.test.ts › "release publishes a new version from main and skips a tagged one"

#### Scenario: Trusted publishing, token only for the first publish
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** permissions are `contents: write` and `id-token: write`, the publish command is `npm publish --access public --provenance`, `secrets.NPM_TOKEN` appears only in the publish step's env, and no job sets `environment`
- **CHECK** tests/workflows.test.ts › "release uses trusted publishing and the npm token only on the publish step"

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
