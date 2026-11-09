## MODIFIED Requirements

### Requirement: Release from main, like kairos-design
Only `.github/workflows/release.yml` SHALL publish. On a push to `main`, a `v*.*.*` tag or a manual run, on Node 24, it SHALL skip a version whose tag exists, run every check, publish with `npm publish --access public --provenance` through npm trusted publishing, and tag only after the publish succeeds. The workflow SHALL use no secrets: the package's trusted publisher is set on npmjs.com, so no npm token is needed.

#### Scenario: New version from main is published, a tagged one is skipped
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** it triggers on push to `main`, on `v*.*.*` tags and on `workflow_dispatch`, uses Node 24, stops before installing when `v<version>` exists on a branch push, checks a pushed tag against the version, and runs the publish step before the step that creates and pushes the tag
- **CHECK** tests/workflows.test.ts › "release publishes a new version from main and skips a tagged one"

#### Scenario: Trusted publishing, token only for the first publish
- **WHEN** the test parses `.github/workflows/release.yml`
- **THEN** permissions are `contents: write` and `id-token: write`, the publish command is `npm publish --access public --provenance`, the publish step has no `env`, the text contains no `secrets.` and no `NPM_TOKEN`, setup-node sets `registry-url: https://registry.npmjs.org`, and no job sets `environment`
- **CHECK** tests/workflows.test.ts › "release uses trusted publishing with no secrets"

#### Scenario: Nothing else publishes
- **WHEN** the test reads every file under `.github/workflows/`
- **THEN** only `release.yml` contains `npm publish`, and `publish.yml` no longer exists
- **CHECK** tests/workflows.test.ts › "only release.yml publishes"
