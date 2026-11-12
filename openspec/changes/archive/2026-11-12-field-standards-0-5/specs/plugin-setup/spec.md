## ADDED Requirements

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
