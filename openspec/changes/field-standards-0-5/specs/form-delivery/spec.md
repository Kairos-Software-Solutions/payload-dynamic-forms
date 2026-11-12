## ADDED Requirements

### Requirement: Dates in messages and webhooks
Emails, WhatsApp text and the snapshot SHALL show a date answer as stored unless its question has a display style; Short, Medium and Long SHALL use `Intl.DateTimeFormat` in the message's language (visitor copy, snapshot and WhatsApp: the submission's; team email: the default), shift no wall-time value, and show a UTC-stored instant in the recorded zone (else the plugin's) with the zone name. Webhooks SHALL carry stored values, plus the zone when recorded.

#### Scenario: Dates read as stored unless a style is set
- **WHEN** `formatAnswerDate` gets `2026-11-12` for a Date question with no `displayStyle`, with `asStored`, and with `medium` in `en` and `es`
- **THEN** the first two give `2026-11-12`, and `medium` gives what `new Intl.DateTimeFormat(<locale>, { dateStyle: 'medium', timeZone: 'UTC' })` gives for 12 Nov 2026 in each language; a locale `Intl` refuses falls back to `en`
- **CHECK** tests/dates.test.ts › "dates read as stored unless a style is set"

#### Scenario: Wall-time values never shift
- **WHEN** `formatAnswerDate` formats `14:30` (Time, `short`) and `2026-11-12T23:30` (Date and time as sent, `long`) with the context time zone `Pacific/Auckland`
- **THEN** the texts show 14:30 and 12 Nov 2026 at 23:30 as `Intl` writes them with `timeZone: 'UTC'`, never another hour or day
- **CHECK** tests/dates.test.ts › "wall-time dates never shift with the time zone"

#### Scenario: UTC instants read in the visitor's zone with its name
- **WHEN** `formatAnswerDate` formats `2026-11-12T19:30:00.000Z` (Date and time, `utc`, `medium`) with the context zone `America/New_York`, and again without a context zone and plugin zone `UTC`
- **THEN** the first shows 12 Nov 2026 at 14:30 followed by ` (America/New_York)`, the second 19:30 followed by ` (UTC)`
- **CHECK** tests/dates.test.ts › "utc date-times read in the visitor's zone with its name"

#### Scenario: Date style shapes emails and the snapshot, not webhooks
- **WHEN** a form with a Date question (`displayStyle: 'long'`), a team email, a visitor copy and a full webhook is submitted in `es` with `2026-11-12` and `_tz` `America/New_York`
- **THEN** the snapshot row and the visitor copy show the long Spanish date, the team email the long English date, and the webhook's `answers` hold `2026-11-12` with `submission.timeZone` `America/New_York`; a submission without `_tz` sends a webhook body with no `timeZone` key
- **CHECK** tests/int/delivery.int.test.ts › "date style shapes emails and the snapshot, not webhooks"
