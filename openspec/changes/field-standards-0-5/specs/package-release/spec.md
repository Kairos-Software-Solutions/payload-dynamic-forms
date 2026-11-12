## ADDED Requirements

### Requirement: README notes for 0.5.0
The README SHALL carry a 0.5.0 migration note (new columns, the default-language copy with `carryOverDefault`, hand-written SQLite/D1 migration, the Postgres edit, import map, rollback), the `timezone` option, date modes and storage, jumps vs show rules, and Send another with the Turnstile note.

#### Scenario: 0.5.0 migration note
- **WHEN** the test reads the Migrations section's `**0.5.0.**` paragraph
- **THEN** it names `default_value`, `_locales`, `mode`, `value_format`, `display_style`, `send_another`, `wording_send_another`, `metadata_time_zone`, `carryOverDefault`, `ADD COLUMN`, `snapshot JSON` and `payload generate:importmap`, says SQLite and D1 sites hand-write the migration because a generated one can rebuild tables and delete child rows, says Postgres runs the copy before the generated `DROP COLUMN`, says defaults that don't fit are reported, and gives the Rollback
- **CHECK** tests/readme.test.ts › "readme has the 0.5.0 changelog and migration note"

#### Scenario: Date modes, jumps and send another are explained
- **WHEN** the test reads the README
- **THEN** it has sections "Date and time questions" (naming Date, Date and time, Time, `dayOnly`, `dayAndTime`, `timeOnly`, `TIME_ZONE_FIELD`, `_tz`, `timezone` and that date-only answers are never converted to UTC), "Jumps and show rules" (saying a jump skips every section in between and to use a show rule for an optional section) and "Send another" (saying Turnstile tokens are single use and the renderer needs a fresh one), and the Options section documents `timezone` with its `UTC` default
- **CHECK** tests/readme.test.ts › "readme explains date modes, jumps and send another"

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
- **THEN** the first entry under `## Changelog` starts with `0.5.0`, later ones with `0.4.0` and then `0.3.0`; the Migrations section keeps its 0.4.0 paragraph (naming `prefill_from_key`, `presentation_mode` and `payload generate:importmap`, the hand-written `ADD COLUMN prefill_from_key` for SQLite and D1 with the snapshot JSON, updates without row ids, the rollback) and its 0.3.0 paragraph that names the `_locales` table and says to copy the old subject and body values; the Compatibility section says to use 0.3.0 or later, and the Rendering section shows `draft: true`
- **CHECK** tests/readme.test.ts › "readme has the 0.3.0 changelog and migration note"; tests/readme.test.ts › "readme has the 0.4.0 changelog and migration note"

#### Scenario: README uses the package name
- **WHEN** the test reads the README and `package.json`
- **THEN** the README's title and its npm, yarn and pnpm install lines use the `name` from `package.json`, and the README never mentions an earlier package name
- **CHECK** tests/readme.test.ts › "readme uses the package name from package.json"

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.5.0, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, peer dependencies `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1` and no others, and Payload 3.92.1's Node engines (`^22.23.4 || >=24.22.1`).

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peers are exactly `payload ^3.92.1`, `@payloadcms/ui ^3.92.1` and `react ^19.2.1`, `publishConfig` equals `{ access: 'public' }` and the version is 0.5.0
- **CHECK** tests/package.test.ts › "package metadata and licence agree"
