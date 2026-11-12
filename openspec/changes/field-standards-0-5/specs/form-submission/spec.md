## ADDED Requirements

### Requirement: Date-time answers stored as chosen
A Date and time answer SHALL be stored exactly as the browser sent it unless its question has `valueFormat: 'utc'`; then the submit endpoint SHALL store the UTC instant (`toISOString` form) of that local time in the visitor's time zone (`_tz`, when `Intl` accepts it), else in the plugin's `timezone`. Date-only and time-only answers SHALL never be converted. A valid `_tz` SHALL be recorded as `metadata.timeZone`.

#### Scenario: Date answers are stored as the browser sent them
- **WHEN** a form with a Date, a Time and a Date and time question (no `valueFormat`) is submitted with `2026-11-12`, `14:30` and `2026-11-12T14:30` and `_tz` `America/New_York`
- **THEN** the stored answers, the snapshot and the webhook body hold exactly those three strings, and `metadata.timeZone` is `America/New_York`
- **CHECK** tests/int/submit.int.test.ts › "date answers are stored as the browser sent them"

#### Scenario: UTC date-times use the visitor's zone
- **WHEN** a Date and time question with `valueFormat: 'utc'` is submitted with `2026-11-12T14:30` and `_tz` `America/New_York`
- **THEN** the stored answer is `2026-11-12T19:30:00.000Z`, and the webhook's answer is the same string with `submission.timeZone` `America/New_York`
- **CHECK** tests/int/submit.int.test.ts › "utc date-times are converted with the visitor's zone"

#### Scenario: Without a usable zone the plugin's zone is used
- **WHEN** the same question is submitted without `_tz`, and again with `_tz` `Not/AZone`, on the dev app (plugin `timezone` unset)
- **THEN** both store `2026-11-12T14:30:00.000Z` (UTC) and leave `metadata.timeZone` empty
- **CHECK** tests/int/submit.int.test.ts › "utc date-times fall back to the plugin time zone"

#### Scenario: Conversion rules
- **WHEN** `toUtcInstant` converts `2026-11-12T14:30` in `Europe/Madrid`, `2026-03-08T02:30` (spring-forward gap) and `2026-11-01T01:30` (fall-back overlap) in `America/New_York`, and the answer converter is given a Date and a Time answer with `valueFormat: 'utc'`
- **THEN** it gives `2026-11-12T13:30:00.000Z`, `2026-03-08T07:30:00.000Z` and `2026-11-01T05:30:00.000Z`, and the Date and Time answers stay as sent
- **CHECK** tests/dates.test.ts › "local date-times convert to utc across daylight saving changes"; tests/dates.test.ts › "date-only and time-only answers are never converted"

#### Scenario: Shared helpers for renderers
- **WHEN** the test imports the shared entry
- **THEN** `TIME_ZONE_FIELD` is `'_tz'`, `normalizeKey('_tz')` is not `'_tz'`, `browserTimeZone()` returns the runtime's `Intl` zone, and `TODAY` is `'today'`
- **CHECK** tests/dates.test.ts › "time zone field and helpers are exported"

### Requirement: Public form carries the 0.5.0 settings
The public form SHALL give every date question its `mode`, `valueFormat` and `displayStyle` (filled with `dayOnly`, `local` and `asStored` when stored empty), number defaults as numbers, `sendAnother`, and `wording.sendAnother`.

#### Scenario: Date questions saved before 0.5.0 stay Date questions
- **WHEN** a published form's date question has `mode`, `value_format` and `display_style` set to NULL straight in the database (as a 0.4.0 row reads after the migration), the public form is read and `2026-11-12` is submitted
- **THEN** the public question has `mode: 'dayOnly'`, `valueFormat: 'local'`, `displayStyle: 'asStored'`, the answer is accepted and stored as `2026-11-12`, and a later save through the Local API that resends the row ids keeps the three columns NULL
- **CHECK** tests/int/submit.int.test.ts › "date questions saved before 0.5.0 stay Date questions"

### Requirement: Send another after success
Forms SHALL have an opt-in "Show a 'Send another' button" checkbox (`sendAnother`), shown under "Show the success words", default off, and a localized word `wording.sendAnother` (default "Send another"). The public form SHALL say `sendAnother: true` only for a message success type with the box ticked; resetting the answers and returning to step 1 is the renderer's.

#### Scenario: Send another is an opt-in under the success words
- **WHEN** the test reads the forms collection
- **THEN** `sendAnother` is a checkbox right after `successType`, labelled "Show a 'Send another' button", with a condition true only when `successType` is `message` and a function default returning false; the Form wording group has a localized `sendAnother`
- **CHECK** tests/plugin-config.test.ts › "send another is an opt-in under the success words"

#### Scenario: Public form says when to offer send another
- **WHEN** three published forms are read: message success with the box ticked, redirect success with the box ticked, and one whose `send_another` and `wording_send_another` were set to NULL in the database
- **THEN** `sendAnother` is true, false and false, and `wording.sendAnother` is "Send another" for the NULL one and the form's own words otherwise (also in `es`)
- **CHECK** tests/int/submit.int.test.ts › "public form says when to offer send another"
