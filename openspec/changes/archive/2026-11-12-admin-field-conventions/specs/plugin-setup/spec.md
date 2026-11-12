## MODIFIED Requirements

### Requirement: Package entry points
The package SHALL export the plugin, its types, the server helpers and `formBlock` from its main entry; the rule engine, answer checks, token, message and wa.me helpers, word defaults and types from `./shared`, which imports no `payload` at runtime and no Node built-ins; and the admin components from `./client` (`'use client'`). React SHALL ship only in `./client`. All three entries SHALL resolve by name from the packed tarball.

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
- **THEN** importing `payload-dynamic-forms` by name gives `formsPlugin`, `formBlock` and `getPublicForm`, importing `payload-dynamic-forms/shared` gives `evaluateRules`, `buildWhatsAppMessage`, `whatsappUrl`, `interpolate` and `DEFAULT_WORDS`, all defined, and `payload-dynamic-forms/client` resolves to a file under `dist/` whose first line is `'use client'` and typechecks an import of `KeyField`, `PrefillParamField`, `RuleFieldKeyField`, `SectionTargetField` and `NoAnswerHint`
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints a line starting `ok`

## ADDED Requirements

### Requirement: Admin components only in the client entry
Fields that need an admin component SHALL name it by import-map path under `payload-dynamic-forms/client`. No file reachable from the main or shared entry SHALL import `react` or `@payloadcms/ui` at runtime.

#### Scenario: Server code names components by path only
- **WHEN** the test reads every file under `src/` outside `src/admin/` and `src/exports/client.ts`
- **THEN** none has a non-type import of `react` or `@payloadcms/ui`, and every `admin.components.Field` path in the forms collection starts with `payload-dynamic-forms/client#` and names an export of `src/exports/client.ts`
- **CHECK** tests/workers-safe.test.ts › "only the client entry imports react or payload ui"; tests/plugin-config.test.ts › "admin component paths name client exports"
