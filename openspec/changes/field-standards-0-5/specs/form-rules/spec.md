## ADDED Requirements

### Requirement: Date answers follow the question's mode
Date answers SHALL be checked in the question's mode: Date `YYYY-MM-DD`, Time `HH:MM` or `HH:MM:SS`, Date and time `YYYY-MM-DDTHH:MM` with optional seconds and no zone. A question with no mode SHALL be a Date question, as in 0.4.0. Earliest and Latest SHALL be compared in the same format, and a `today` limit SHALL resolve in the given time zone (the visitor's, else the plugin's) at the given moment. Answers SHALL be kept as sent, trimmed.

#### Scenario: Date mode accepts calendar dates as sent
- **WHEN** `checkAnswers` gets `2026-11-12`, `2026-02-30` and `12/11/2026` for a Date question with Earliest `2026-11-01`, and `2026-10-31` for the same question
- **THEN** only `2026-11-12` is accepted and stored as `2026-11-12`; the others get the invalid words
- **CHECK** tests/answers.test.ts › "date mode accepts calendar dates as sent"

#### Scenario: A date question without a mode is a Date question
- **WHEN** a date question has `mode` null (saved under 0.4.0) and gets `2026-11-12`, then `14:30`
- **THEN** the first is accepted as sent and the second is invalid, exactly as with `mode: 'dayOnly'`
- **CHECK** tests/answers.test.ts › "a date question without a mode is a Date question"

#### Scenario: Time mode accepts times within its limits
- **WHEN** a Time question with Earliest `09:00` and Latest `17:00` gets `14:30`, `14:30:15`, `08:59`, `24:00` and `2:30 pm`
- **THEN** `14:30` and `14:30:15` are accepted as sent, the others are invalid
- **CHECK** tests/answers.test.ts › "time mode accepts times within its limits"

#### Scenario: Date and time mode accepts local date-times within its limits
- **WHEN** a Date and time question with Latest `2026-12-31T18:00` gets `2026-11-12T14:30`, `2026-11-12T14:30:05`, `2026-11-12T14:30Z`, `2026-11-12` and `2027-01-01T09:00`
- **THEN** the first two are accepted as sent, the others are invalid
- **CHECK** tests/answers.test.ts › "date and time mode accepts local date-times within its limits"

#### Scenario: Today limits resolve in the visitor's time zone
- **WHEN** a Date question with Earliest `today` is checked with `now` `2026-11-12T03:00:00Z` and `timeZone` `America/New_York`, for `2026-11-11` and `2026-11-10`; and with `timeZone` `UTC`
- **THEN** in New York `2026-11-11` is accepted and `2026-11-10` is invalid; in UTC `2026-11-11` is invalid; and `resolveDateLimit(field, 'min', { now, timeZone })` gives `2026-11-11` and `2026-11-12`
- **CHECK** tests/answers.test.ts › "today limits resolve in the visitor's time zone"

### Requirement: Starting answers for typed defaults
`initialAnswers` and `defaultAnswer` SHALL resolve a `today` default in the runtime's local time zone to the question's mode (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, `HH:MM`) at an optional `now`, start a select or radio default outside the field's options as empty, keep only listed values of a checkbox-group default, and start number defaults as numbers. A link parameter SHALL still win over the default.

#### Scenario: Today defaults resolve when the form starts
- **WHEN** `initialAnswers` runs with `now` set to a local 12 Nov 2026 14:30:20 for a Date, a Date and time and a Time question, each with default `today`
- **THEN** they start as `2026-11-12`, `2026-11-12T14:30` and `14:30`
- **CHECK** tests/rules.test.ts › "today defaults resolve when the form starts"

#### Scenario: Choice defaults outside the options start empty
- **WHEN** a radio has default `gone` with options `a` and `b`, a select has default `b`, and a checkbox group has default `a,gone`
- **THEN** they start as empty, `b` and `['a']`, and a link `?radio-key=a` still sets the radio to `a`
- **CHECK** tests/rules.test.ts › "choice defaults outside the options start empty"

#### Scenario: Number defaults start as numbers
- **WHEN** a number question has the stored default `'12'`, and another has `'1.5'`
- **THEN** they start as the numbers `12` and `1.5`
- **CHECK** tests/rules.test.ts › "number defaults start as numbers"

### Requirement: Jumps skip every section in between
A matching jump SHALL go straight to its target and skip every section in between, even sections whose show rules match (standard skip logic). This is the 0.4.0 engine, unchanged; the requirement pins it.

#### Scenario: A jump skips a section whose show rule matches
- **WHEN** a step-by-step form has sections `s1` (question `kind`, jump to `s3` when `kind` equals `a`), `s2` (shown when `kind` equals `a`) and `s3`, and the path is read for `kind = a` and `kind = b`
- **THEN** the path is `s1, s3` for `a` and `s1, s3` for `b` (s2 is hidden for `b`), and `getNextSectionKey(form, 's1', { kind: 'a' })` is `s3`
- **CHECK** tests/steps.test.ts › "a jump skips a section whose show rule matches"
