# Spec Delta: package-release

## Purpose

What makes the plugin installable and maintainable as a public npm package: its docs, licence, the files it ships, CI on every push, and a publish workflow that runs only on a version tag.

## ADDED Requirements

### Requirement: README
The README SHALL cover: what the plugin does and does not do (no visitor UI), install with any package manager from public npm, the one-call setup with every option, the storage plugin order for attachments on R2, migrations, switching it off, a minimal rendering example, the WhatsApp popup note, delivery after the reply, the endpoints and their responses, and the tested Payload range. It SHALL name no client.

#### Scenario: Example in the README is real code
- **WHEN** the test reads the README's rendering example and `examples/minimal-form.tsx`
- **THEN** the README block equals the file, and the file passes `yarn typecheck`
- **CHECK** tests/readme.test.ts › "readme example equals examples/minimal-form.tsx"

#### Scenario: README covers the setup topics
- **WHEN** the test reads the README
- **THEN** it has sections for install, options, attachments and storage order, migrations, switching off, rendering, WhatsApp, delivery after the reply, endpoints and compatibility
- **CHECK** tests/readme.test.ts › "readme has every setup section"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the licence the reviewer picks (MIT unless he says otherwise), and `package.json` SHALL carry the same licence, the package name, version 0.1.0, `publishConfig.access: public`, the repository URL, the `payload-plugin` keyword, `payload ^3.92.1` as its only peer dependency, and the same Node engines as Payload 3.92.1 (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the peer range is `^3.92.1`, access is public and the version is 0.1.0
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

### Requirement: Publish on a version tag
A second workflow SHALL run only on tags `v*.*.*`: the same checks, a check that the tag equals `package.json`'s version, then `npm publish --access public --provenance` with `NODE_AUTH_TOKEN` from the `NPM_TOKEN` secret, inside a GitHub environment named `npm` so the reviewer can require approval. No other workflow SHALL publish.

#### Scenario: Publish runs only on tags with the token
- **WHEN** the test parses `.github/workflows/publish.yml`
- **THEN** it triggers only on `v*.*.*` tags, has `id-token: write` and `contents: read`, uses environment `npm`, checks tag against version before publishing, and passes `secrets.NPM_TOKEN` only to the publish step
- **CHECK** tests/workflows.test.ts › "publish runs only on version tags with the npm token"

#### Scenario: Nothing else publishes
- **WHEN** the test reads every file under `.github/workflows/`
- **THEN** only `publish.yml` contains `npm publish`
- **CHECK** tests/workflows.test.ts › "only publish.yml publishes"

### Requirement: Tests on the dev app
`yarn test` SHALL run the unit tests and the integration tests, which start the plugin template's dev app on SQLite with a capturing email adapter and stubbed outbound HTTP, so no test needs a network, a Cloudflare account or a secret.

#### Scenario: Suite runs offline
- **WHEN** `yarn test` runs in the sandbox
- **THEN** every unit and integration test passes, and the run makes no request outside localhost
- **CHECK** `yarn test` exits 0; tests/int/boot.int.test.ts › "integration tests make no outside requests"
