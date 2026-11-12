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
