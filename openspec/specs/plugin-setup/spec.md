# plugin-setup Specification

## Purpose
How an app installs the forms plugin with one `formsPlugin(options)` call, which options it takes, how it is switched off, and what the package exports.

## Requirements

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

### Requirement: Form block helper
The package SHALL export `formBlock(options?)`, returning a Payload block (default slug `formBlock`) with one required relationship that picks a form from the forms collection, so an app places a form on any page by adding the block to its page blocks. The block SHALL hold no words of its own.

#### Scenario: Block picks a form
- **WHEN** an app calls `formBlock()` with the default forms slug
- **THEN** the block has slug `formBlock` and a required `form` relationship to `custom-forms`, and no other fields
- **CHECK** tests/plugin-config.test.ts › "formBlock picks one form and holds no words"

### Requirement: Admin components only in the client entry
Fields that need an admin component SHALL name it by import-map path under `payload-dynamic-forms/client`. No file reachable from the main or shared entry SHALL import `react` or `@payloadcms/ui` at runtime.

#### Scenario: Server code names components by path only
- **WHEN** the test reads every file under `src/` outside `src/admin/` and `src/exports/client.ts`
- **THEN** none has a non-type import of `react` or `@payloadcms/ui`, and every `admin.components.Field` path in the forms collection starts with `payload-dynamic-forms/client#` and names an export of `src/exports/client.ts`
- **CHECK** tests/workers-safe.test.ts › "only the client entry imports react or payload ui"; tests/plugin-config.test.ts › "admin component paths name client exports"

### Requirement: Time zone option
`formsPlugin` SHALL take an optional `timezone` (an IANA time zone name, default `UTC`), used for `today` limits and UTC conversion when a submission sends no usable zone, and for showing UTC instants without a recorded zone. An unknown zone SHALL make the plugin throw when the config is built.

#### Scenario: Timezone option defaults to UTC and refuses unknown zones
- **WHEN** the plugin is built without `timezone`, with `timezone: 'America/New_York'`, and with `timezone: 'Mars/Base'`
- **THEN** the resolved options hold `UTC` and `America/New_York`, and the third throws an error naming `Mars/Base`
- **CHECK** tests/plugin-config.test.ts › "timezone option defaults to UTC and refuses unknown zones"

### Requirement: Carry-over helper for 0.4.0 defaults
The main entry SHALL export `carryOverDefault`, a pure function a site's upgrade migration calls per question with its old localized defaults by locale. It SHALL return the default-locale value when it fits the 0.5.0 rules for that question type, else no value, and a report line for every value it doesn't carry, including other locales' values that differ from the carried one.

#### Scenario: 0.4.0 defaults that fit are carried over
- **WHEN** it gets a select with options `yes`, `no` and `{ en: ' no ', es: 'no' }`, a date with `{ en: '2026-12-01' }`, a number with Min 1, Max 10 and `{ en: '5' }`, an email with `{ en: 'team@example.com' }`, and a collection select with `{ en: 'cameras' }` and source values `cameras`, `tripods`
- **THEN** it carries `no`, `2026-12-01`, `5`, `team@example.com` and `cameras`, each with an empty report
- **CHECK** tests/carry-over.test.ts › "0.4.0 defaults that fit are carried over"

#### Scenario: 0.4.0 defaults that don't fit are reported, not carried
- **WHEN** it gets a radio with options `a`, `b` and `{ en: 'Yes please' }`, a date with `{ en: 'next week' }`, a number with Max 10 and `{ en: '20' }`, an email with `{ en: 'n/a' }`, a select with options `a`, `b` and `{ en: 'a', es: 'b' }`, and a collection select with `{ en: 'cameras' }` and no source values
- **THEN** the first four carry nothing and report the value and the reason; the select carries `a` and reports that `es` had `b`; the collection select carries `cameras` and reports it was not checked against the collection
- **CHECK** tests/carry-over.test.ts › "0.4.0 defaults that don't fit are reported, not carried"

### Requirement: Storing the visitor's time zone can be switched off
`formsPlugin` SHALL take `metadata.timeZone` (boolean, default true, like `metadata.userAgent`). When false, a valid `_tz` SHALL still be used for that request (answer checks, UTC conversion, snapshot and messages) but SHALL NOT be stored in `metadata.timeZone` or sent in webhook bodies.

#### Scenario: Time zone kept only when metadata allows it
- **WHEN** the plugin is built without `metadata` and with `metadata: { timeZone: false }`; and on a dev app started with `metadata: { ip: true, timeZone: false }` a Date and time question with `valueFormat: 'utc'` and a full webhook is submitted with `2026-11-12T14:30` and `_tz` `America/New_York`
- **THEN** the resolved `metadata.timeZone` is true and then false; the stored answer is `2026-11-12T19:30:00.000Z` (the zone was used), the submission's `metadata.timeZone` is empty and the webhook body has no `timeZone` key
- **CHECK** tests/plugin-config.test.ts › "metadata time zone option defaults to on"; tests/int/submit.int.test.ts › "time zone is used but not stored when metadata.timeZone is off"

### Requirement: Rollback helper for 0.5.0 values
The main entry SHALL export `rollbackDefault`, a pure function a site's migration `down()` calls per question with its 0.5.0 default and date limits. It SHALL return what 0.4.0 can read: email, number, select and radio defaults as stored (trimmed); a date default, Earliest and Latest only as `YYYY-MM-DD`, else no value; and a report line for every value it drops.

#### Scenario: 0.5.0 values are put back for 0.4.0
- **WHEN** it gets a select default `no`, a number default `12`, a date default `2026-12-01` with Earliest `today` and Latest `2027-01-31`, a date default `today`, a date-time default `2026-12-01T09:00` with Latest `2026-12-31T18:00`, and a time default `09:30` with Earliest `09:00`
- **THEN** it gives `no` and `12` with empty reports; `2026-12-01` with no Earliest, Latest `2027-01-31` and a report line for the `today` Earliest; and no default and no limits for the last three, with a report line naming each dropped value
- **CHECK** tests/carry-over.test.ts › "0.5.0 values are put back in a form 0.4.0 can read"
