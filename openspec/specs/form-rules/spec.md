# form-rules Specification

## Purpose
The rule engine and answer checks shared by the browser and the server, so a form behaves the same in an app's renderer and in the submit endpoint: show/hide rules, required-while-visible, the step path, option attributes, prefill and value checks.

## Requirements

### Requirement: Rule groups and operators
A rule group SHALL match when all of its rows match (`all`, the default) or any row matches (`any`); an empty group SHALL match. Rows SHALL support equals, not equals, contains, not contains, has a value, has no value, greater than, less than (numbers, else dates) and includes option. The operator list SHALL be defined once and reused by every rule field.

#### Scenario: All and any
- **WHEN** a group has two rows of which one matches
- **THEN** it matches with `any` and does not match with `all`
- **CHECK** tests/rules.test.ts › "all needs every row, any needs one"

#### Scenario: Each operator
- **WHEN** each of the nine operators is evaluated against a matching and a non-matching answer, including numbers, dates, an empty answer and a checkbox-group answer
- **THEN** each returns true for the match and false for the other
- **CHECK** tests/rules.test.ts › "each operator matches and rejects"

#### Scenario: One operator list
- **WHEN** the forms collection config is built
- **THEN** every rule row's operator field uses the same options array as the shared `OPERATORS` export
- **CHECK** tests/plugin-config.test.ts › "every rule row uses the shared operator list"

### Requirement: Show and hide
A section SHALL be shown when its rules match; a field SHALL be shown when its section is shown and its own rules match. A required field SHALL count as required only while it is shown. Answers to hidden fields SHALL be dropped before checks, storage and delivery.

#### Scenario: Hidden section hides its fields
- **WHEN** a section's rule does not match
- **THEN** none of its fields are visible, even those without rules
- **CHECK** tests/rules.test.ts › "hidden section hides its fields"

#### Scenario: Required only while visible
- **WHEN** a required field is hidden by a rule and left empty
- **THEN** the answer checks report no error for it
- **CHECK** tests/answers.test.ts › "required counts only while visible"

#### Scenario: Hidden answers are dropped
- **WHEN** answers include a value for a hidden field
- **THEN** the checked answers leave that key out
- **CHECK** tests/answers.test.ts › "answers to hidden fields are dropped"

### Requirement: Option attributes in rules
For a choice field whose choices come from a source, a rule row SHALL be able to name an attribute of the chosen option as `<field key>.<attribute>` (for example `need.fieldSet` equals `item`), so question sets can depend on what the chosen item says rather than on its value.

#### Scenario: Question set follows the chosen topic
- **WHEN** the `need` choice is a topic whose `fieldSet` is `item`, and the item section's rule is `need.fieldSet equals item` and the service section's is `need.fieldSet equals service`
- **THEN** the item section is visible and the service section is hidden; choosing a `service` topic flips them
- **CHECK** tests/rules.test.ts › "rules read the chosen option's attributes"

### Requirement: Steps and their path
In step-by-step forms the path SHALL start at the first visible section; from each section the first next-step rule that matches and targets a visible section SHALL win, else the next visible section. The server SHALL check only fields in sections on that path; in single-page forms every visible section counts.

#### Scenario: Next-step rule jumps
- **WHEN** section A has a rule "budget greater than 1000 → C" and the answer is 5000
- **THEN** the step after A is C, and with 500 it is B
- **CHECK** tests/steps.test.ts › "first matching next-step rule wins, else next visible"

#### Scenario: Skipped sections don't block sending
- **WHEN** a step-by-step form jumps from A to C and B has an empty required field
- **THEN** the answer checks report no error for B's field and drop B's answers
- **CHECK** tests/steps.test.ts › "sections skipped by a jump are not checked"

#### Scenario: Step progress
- **WHEN** a renderer asks for the progress at section C on a path A → C → D
- **THEN** the helper returns current 2 of total 3, and fills the form's step progress words with them
- **CHECK** tests/steps.test.ts › "step progress counts the path, not every section"

### Requirement: Answer checks
The shared checks SHALL normalise answers by field type and report a field error, using that field's error words, for: an empty required field, an email that is not a single valid address, a number that is not a number or outside min/max, a date that is not a date or outside its range, text outside its length limits, and a choice that is not one of the field's options.

#### Scenario: Email format
- **WHEN** an email field gets `a@b`, `a b@c.com`, `a@b.com, c@d.com` and `name@example.com`
- **THEN** the first three are reported invalid and the last passes
- **CHECK** tests/answers.test.ts › "email must be one valid address"

#### Scenario: Number, date and length limits
- **WHEN** a number field with min 1 and max 10 gets `0`, `11`, `x` and `5`, a date field with a range gets a date outside it, and a text field with max length 5 gets six characters
- **THEN** each out-of-range or malformed value is reported with the field's invalid words and `5` passes
- **CHECK** tests/answers.test.ts › "number, date and length limits"

#### Scenario: Only listed choices
- **WHEN** a radio field gets a value that is not one of its options, and a checkbox group gets two listed values and one unlisted
- **THEN** both are reported invalid; with only listed values they pass
- **CHECK** tests/answers.test.ts › "choices must be listed options"

#### Scenario: Checkbox values
- **WHEN** a checkbox gets `on`, `true`, `1`, `yes`, `false` or nothing
- **THEN** the first four normalise to true and the rest to false, and a required checkbox fails when false
- **CHECK** tests/answers.test.ts › "checkbox values normalise to booleans"

### Requirement: Prefill from link parameters
An input with a link parameter name SHALL start with that parameter's value when the app passes the page's search parameters to the initial-answers helper. For choice fields the value SHALL be used only when it is one of the options; otherwise the default applies.

#### Scenario: Topic preselected from the link
- **WHEN** the `need` field's link parameter is `need` and the page has `?need=cameras`, a listed value
- **THEN** the initial answers have `need: 'cameras'`; with `?need=unknown` they have the field's default
- **CHECK** tests/rules.test.ts › "prefill uses listed values from the link"

### Requirement: Prefill parameter follows the key
Each input question SHALL have a hidden lock, `prefillFromKey`, like Payload's slug field, whose default is a function (no database default). Locked, the link parameter SHALL equal the key, on screen and on save; unlocked, the editor's parameter (or none) SHALL be kept. New questions SHALL start locked, except single checkbox questions, which start unlocked. 0.3.0 questions have no lock value and SHALL be treated as unlocked, so their parameter is kept.

#### Scenario: New question prefills by its key
- **WHEN** a form is created through the API with a text question keyed ` Full Name ` and no `prefillFromKey` or `prefillParam`
- **THEN** it is stored with `prefillFromKey: true` and `prefillParam: 'full-name'`, and `initialAnswers` with `?full-name=Ana` starts it as `Ana`
- **CHECK** tests/int/form-save.int.test.ts › "new questions are locked and prefill by their key"

#### Scenario: New checkbox question starts unlocked
- **WHEN** a form is created through the API with a single checkbox question keyed `consent` and no `prefillFromKey` or `prefillParam`
- **THEN** it is stored with `prefillFromKey: false` and an empty `prefillParam`, and `initialAnswers` with `?consent=yes` leaves it unticked; saved again with `prefillFromKey: true`, its `prefillParam` is `consent`
- **CHECK** tests/int/form-save.int.test.ts › "new checkbox questions start unlocked"

#### Scenario: Lock default adds no database default
- **WHEN** the test reads `prefillFromKey` in every built-in input block and in an app-defined type
- **THEN** it is a hidden checkbox whose `defaultValue` is a function, returning `false` in the single checkbox block and `true` in every other block
- **CHECK** tests/plugin-config.test.ts › "prefillFromKey default is a function"

#### Scenario: Locked parameter follows a key change
- **WHEN** a locked question's key changes from `need` to `topic` and the form is saved
- **THEN** its `prefillParam` is `topic`
- **CHECK** tests/int/form-save.int.test.ts › "a locked prefill parameter follows the key"

#### Scenario: Unlocked parameter is kept
- **WHEN** a question is saved with `prefillFromKey: false` and `prefillParam: 'ref'`, or with `prefillFromKey: false` and no parameter
- **THEN** it keeps `ref`, or stays without a parameter, after its key changes
- **CHECK** tests/int/form-save.int.test.ts › "an unlocked prefill parameter is kept"

#### Scenario: 0.3.0 question with no parameter stays unprefilled
- **WHEN** a stored question has `prefillFromKey` null and an empty `prefillParam` (written straight to the database, as a 0.3.0 row reads after the migration) and the form is updated through the Local API resending `sections` with every section and question row id, without those two fields
- **THEN** `prefillFromKey` stays null, `prefillParam` stays empty, and `initialAnswers` with `?<key>=x` leaves the default
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions without a parameter stay unprefilled"

#### Scenario: 0.3.0 question with a parameter keeps it
- **WHEN** a stored question has `prefillFromKey` null and `prefillParam: 'need'` while its key is `topic`, and the form is updated through the Local API resending `sections` with their row ids
- **THEN** `prefillParam` is still `need`
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions keep their parameter"

#### Scenario: Lock and unlock in the admin
- **WHEN** the prefill component renders a locked question keyed `need`, the key changes to `topic`, the editor clicks Unlock and types `ref`, then clicks Lock
- **THEN** the input shows `topic` read-only, then `ref` editable with `prefillFromKey` false, then `topic` read-only with `prefillFromKey` true; a row with `prefillFromKey` null renders unlocked with its stored text, and a file upload question shows no lock
- **CHECK** tests/admin/prefill-field.test.tsx › "prefill locks to the key and unlocks to edit"

#### Scenario: Lock button sits inside the input box like the slug field's
- **WHEN** the prefill component renders, locked and unlocked
- **THEN** the Lock/Unlock button is positioned against the input box itself, not the whole field (label and description excluded), mirroring how `@payloadcms/ui@3.92.1` `fields/Slug` places its Unlock button, so it is vertically centred in the input
- **CHECK** tests/admin/prefill-field.test.tsx › "lock button sits inside the input box"

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
- **THEN** in New York `2026-11-11` is accepted and `2026-11-10` is invalid; in UTC `2026-11-11` is invalid; and `resolveDateLimit(field, 'min', { now, timeZone })` gives `2026-11-11` and `2026-11-12`; a Date and time question with Earliest and Latest `today`, at the same `now` in New York, accepts `2026-11-11T00:00` and `2026-11-11T23:59` and refuses `2026-11-10T23:59` and `2026-11-12T00:00`, and `resolveDateLimit` gives `2026-11-11T00:00` and `2026-11-11T23:59`
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
