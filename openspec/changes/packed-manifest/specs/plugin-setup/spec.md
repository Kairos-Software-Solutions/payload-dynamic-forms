## MODIFIED Requirements

### Requirement: Package entry points
The package SHALL export the plugin, its option and document types, the server helpers and `formBlock` from its main entry, and SHALL export the rule engine, answer checks, token, message and wa.me helpers, word defaults and types from a `./shared` entry that imports nothing from `payload` at runtime and no Node built-ins, so it runs in the browser and on Workers. Both entries SHALL import by package name from the packed tarball. The package SHALL ship no React components.

#### Scenario: Shared entry is runtime-free of Payload
- **WHEN** the test reads every file under `src/shared/`
- **THEN** none has a non-type import of `payload`, `@payloadcms/*`, `react` or any `node:` module
- **CHECK** tests/workers-safe.test.ts › "shared entry imports nothing from payload, react or node at runtime"

#### Scenario: Runtime code is Workers-safe
- **WHEN** the test reads every file under `src/`
- **THEN** none imports a Node built-in other than `node:buffer`, and none uses `fs`, `path`, `child_process` or `process.cwd`
- **CHECK** tests/workers-safe.test.ts › "src imports no Node built-ins except node:buffer"

#### Scenario: Built package exposes both entries
- **WHEN** `yarn build` has run and `yarn check:packed` installs the packed tarball into a scratch ESM app outside the repo
- **THEN** importing `payload-dynamic-forms` by name gives `formsPlugin`, `formBlock` and `getPublicForm`, and importing `payload-dynamic-forms/shared` gives `evaluateRules`, `buildWhatsAppMessage`, `whatsappUrl`, `interpolate` and `DEFAULT_WORDS`, all defined
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints a line starting `ok`
