# Spec Delta: plugin-setup

## Purpose

How an app installs the forms plugin with one `formsPlugin(options)` call, which options it takes, how it is switched off, and what the package exports.

## ADDED Requirements

### Requirement: One-call install
An app SHALL install the plugin by adding `formsPlugin(options)` to its Payload config's `plugins`. With no options besides the defaults, the plugin SHALL add the forms, submissions and attachments collections and its endpoints, keep every collection, global, endpoint, hook and `onInit` the app already had, and run on any app on `payload ^3.92.1`.

#### Scenario: Defaults add the three collections
- **WHEN** a config with one `posts` collection runs `formsPlugin({})`
- **THEN** the resulting config has `posts`, `custom-forms`, `custom-form-submissions` and `custom-form-attachments`, and the submit, public-read and resend endpoints
- **CHECK** tests/plugin-config.test.ts › "defaults add the three collections and endpoints"

#### Scenario: Existing config survives
- **WHEN** the app config already has collections, endpoints, an `onInit` and its own globals
- **THEN** all of them are still there after the plugin runs, and the app's `onInit` still runs
- **CHECK** tests/plugin-config.test.ts › "keeps the app's collections, endpoints, globals and onInit"

#### Scenario: Dev app boots with the plugin on SQLite
- **WHEN** the dev app (`dev/payload.config.ts`, SQLite) starts with the plugin
- **THEN** Payload initialises and `payload.collections` holds the three plugin collections
- **CHECK** tests/int/boot.int.test.ts › "dev app boots with the plugin on SQLite"

### Requirement: Enabled flag
The plugin SHALL take `enabled` (default `true`). With `enabled: false` it SHALL return the app's config unchanged: no collections, fields, endpoints or hooks, so a starter can include the call switched off. The README SHALL warn that switching it off on an app that already has form data drops those tables at the next migration.

#### Scenario: Switched off adds nothing
- **WHEN** a config runs `formsPlugin({ enabled: false })`
- **THEN** the returned config deep-equals the input config
- **CHECK** tests/plugin-config.test.ts › "enabled false returns the config unchanged"

### Requirement: Renameable slugs and overrides
The plugin SHALL take `slugs` for each of its collections and `formOverrides`, `submissionOverrides` and `attachmentOverrides`. An override SHALL accept any collection config property, and its `fields` SHALL be a function that receives `{ defaultFields }` and returns the field list, in the official form builder's style.

#### Scenario: Slugs are renamed everywhere
- **WHEN** the plugin runs with `slugs: { forms: 'forms-x', submissions: 'subs-x', attachments: 'files-x' }`
- **THEN** the collections use those slugs and every relationship between them points at the new slugs
- **CHECK** tests/plugin-config.test.ts › "renamed slugs are used by every relationship"

#### Scenario: Field override receives the defaults
- **WHEN** `formOverrides.fields` returns `[...defaultFields, { name: 'extra', type: 'text' }]`
- **THEN** the forms collection has every default field plus `extra`
- **CHECK** tests/plugin-config.test.ts › "field overrides receive defaultFields"

#### Scenario: Override access wins
- **WHEN** `submissionOverrides.access.read` is set to a function
- **THEN** the submissions collection uses that function for read access
- **CHECK** tests/plugin-config.test.ts › "override access replaces the default"

### Requirement: Field-type registry
The plugin SHALL take `fields`, keyed by field type. `true` or `false` SHALL turn a built-in type on or off, a partial block SHALL be deep-merged into the built-in block, and a key the plugin does not know with a full definition (block plus optional `validate`, `normalize` and `toText` functions) SHALL add a new field type that the server checks like a built-in one. `fileUpload` SHALL be off unless turned on.

#### Scenario: Built-in types on and off
- **WHEN** the plugin runs with `fields: { date: false, fileUpload: true }`
- **THEN** the section field blocks include `fileUpload` and not `date`, and all other built-in types stay
- **CHECK** tests/plugin-config.test.ts › "fields registry turns built-in types on and off"

#### Scenario: Partial block is merged
- **WHEN** `fields: { text: { labels: { singular: 'Short answer' } } }`
- **THEN** the `text` block keeps its built-in fields and shows the new label
- **CHECK** tests/plugin-config.test.ts › "partial block is deep-merged into the built-in"

#### Scenario: New field type is checked on the server
- **WHEN** an app adds a `postcode` type with a `validate` that rejects values without a digit, and a visitor submits `abc` to a visible required `postcode` field
- **THEN** the submit endpoint answers 400 with the `validate` message on that field
- **CHECK** tests/int/submit.int.test.ts › "custom field type validate runs on the server"

### Requirement: Package entry points
The package SHALL export the plugin, its option and document types, the server helpers and `formBlock` from its main entry, and SHALL export the rule engine, answer checks, token, message and wa.me helpers, word defaults and types from a `./shared` entry that imports nothing from `payload` at runtime and no Node built-ins, so it runs in the browser and on Workers. The package SHALL ship no React components.

#### Scenario: Shared entry is runtime-free of Payload
- **WHEN** the test reads every file under `src/shared/`
- **THEN** none has a non-type import of `payload`, `@payloadcms/*`, `react` or any `node:` module
- **CHECK** tests/workers-safe.test.ts › "shared entry imports nothing from payload, react or node at runtime"

#### Scenario: Runtime code is Workers-safe
- **WHEN** the test reads every file under `src/`
- **THEN** none imports a Node built-in other than `node:buffer`, and none uses `fs`, `path`, `child_process` or `process.cwd`
- **CHECK** tests/workers-safe.test.ts › "src imports no Node built-ins except node:buffer"

#### Scenario: Built package exposes both entries
- **WHEN** `yarn build` has run and a test imports `dist/index.js` and `dist/exports/shared.js`
- **THEN** `formsPlugin`, `formBlock`, `getPublicForm` and `evaluateRules`, `buildWhatsAppMessage`, `whatsappUrl`, `interpolate`, `DEFAULT_WORDS` are defined
- **CHECK** `yarn build && node -e "Promise.all([import('./dist/index.js'),import('./dist/exports/shared.js')]).then(([a,b])=>{for(const k of ['formsPlugin','formBlock','getPublicForm'])if(!a[k])throw k;for(const k of ['evaluateRules','buildWhatsAppMessage','whatsappUrl','interpolate','DEFAULT_WORDS'])if(!b[k])throw k;console.log('ok')})"` prints `ok`

### Requirement: Form block helper
The package SHALL export `formBlock(options?)`, returning a Payload block (default slug `formBlock`) with one required relationship that picks a form from the forms collection, so an app places a form on any page by adding the block to its page blocks. The block SHALL hold no words of its own.

#### Scenario: Block picks a form
- **WHEN** an app calls `formBlock()` with the default forms slug
- **THEN** the block has slug `formBlock` and a required `form` relationship to `custom-forms`, and no other fields
- **CHECK** tests/plugin-config.test.ts › "formBlock picks one form and holds no words"
