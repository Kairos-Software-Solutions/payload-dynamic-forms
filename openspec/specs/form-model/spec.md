# form-model Specification

## Purpose
The forms, submissions and attachments collections the plugin adds: what an editor sets on a form, the words visitors read, who may read or write each part, and the checks that run when a form is saved.

## Requirements

### Requirement: Form structure
A form SHALL have a title, a slug (Payload's slug field, unique), open or closed intake, single-page or step-by-step presentation, success by message or redirect URL, and one or more sections. Each section SHALL have a key, title, description, field blocks, show/hide rules and, for steps, next-step rules. Forms SHALL keep drafts and 20 versions, without scheduled publishing.

#### Scenario: A form with two sections saves and publishes
- **WHEN** an admin creates a form with two sections, each with a text field, and publishes it
- **THEN** the form reads back with both sections, their field blocks and `_status: published`
- **CHECK** tests/int/form-save.int.test.ts › "form with two sections saves and publishes"

#### Scenario: Versions and drafts without scheduled publish
- **WHEN** the plugin config is built
- **THEN** the forms collection has `versions.drafts` on, `versions.maxPerDoc` 20 and no `schedulePublish`
- **CHECK** tests/plugin-config.test.ts › "forms keep drafts and 20 versions without scheduled publish"

### Requirement: Built-in field types
The section field blocks SHALL be: heading and help text (display only), text, email, textarea, number, date, select, radio, checkbox, checkbox group (several choices) and file upload. Each input SHALL have a key, required (off by default), width (full or half), default value, show/hide rules, an optional link parameter to prefill from, and type limits: length for text and textarea, min and max for number and date, files per field for uploads.

#### Scenario: Every built-in type saves
- **WHEN** a form with one block of each built-in type (file upload turned on) is saved
- **THEN** it saves without errors and reads back with every block type in order
- **CHECK** tests/int/form-save.int.test.ts › "every built-in field type saves"

#### Scenario: Inputs are optional by default
- **WHEN** a text block is added without touching required
- **THEN** it is saved with `required: false`
- **CHECK** tests/int/form-save.int.test.ts › "inputs are optional unless required is ticked"

### Requirement: Words in Payload, grouped per question
Every word a visitor reads SHALL be a field in Payload. Each input SHALL group its words: label, hint, placeholder, error when empty, error when invalid, and the label its row gets in messages. Each form SHALL have a "Form wording" group (send, sending, sent, continue, back, choose one, step progress, optional hint, error prefix, closed, success and server error words). Defaults come from code and the plugin's `words` option; word fields SHALL be localized when the app has localization.

#### Scenario: New form starts with the default words
- **WHEN** a form is created without touching its wording
- **THEN** every "Form wording" field holds the default from `DEFAULT_WORDS`, overridden by any key the plugin's `words` option sets
- **CHECK** tests/int/form-save.int.test.ts › "new form starts with default and option words"

#### Scenario: Words are stored per locale
- **WHEN** the dev app has locales `en` and `es` and the send word is saved as "Send" in `en` and "Enviar" in `es`
- **THEN** reading the form in each locale returns that locale's word
- **CHECK** tests/int/form-save.int.test.ts › "words are localized when the app has locales"

#### Scenario: Server messages come from the form's words
- **WHEN** every server-message word of a form (closed, required, invalid, wrong file, too many tries, security check failed, generic error, success) and the field error words are set to marker values, and each of those paths is triggered
- **THEN** every response message and field error is the matching marker, never a fixed English string
- **CHECK** tests/int/submit.int.test.ts › "server messages come from the form's words"

#### Scenario: Yes and No come from the form's words
- **WHEN** a ticked and an unticked checkbox answer are turned into message text (email, WhatsApp, webhook, snapshot)
- **THEN** they read the form's `yes` and `no` words (defaults "Yes" and "No", localized like the other words), never a word fixed in code
- **CHECK** tests/answers.test.ts › "checkbox answers use the form's yes and no words"

### Requirement: Choices from a collection
The plugin SHALL take `optionSources`, each naming a collection, its label and value fields and extra attributes to carry. A select, radio or checkbox-group block SHALL take its choices either typed in the block or from a source; for a source, the editor SHALL pick items in a sortable relationship, and leaving it empty SHALL mean all items sorted by the source's default sort.

#### Scenario: Picked items set the choices and their order
- **WHEN** a `topics` source points at a collection with `label`, `slug` and attributes `fieldSet`, `opener`, `closer`, and a radio block picks three topics in the order C, A, B
- **THEN** the public form lists the choices C, A, B with their labels, slug values and attributes
- **CHECK** tests/int/option-sources.int.test.ts › "picked source items set the choices and their order"

#### Scenario: Empty pick means all, sorted
- **WHEN** the radio block's source pick is empty
- **THEN** the public form lists every published item of the source collection in its default sort
- **CHECK** tests/int/option-sources.int.test.ts › "empty pick lists all items in default sort"

#### Scenario: Unpublished or deleted items are left out
- **WHEN** a picked topic is unpublished (the source collection has drafts) or deleted
- **THEN** the public form leaves it out without an error
- **CHECK** tests/int/option-sources.int.test.ts › "unpublished or deleted items are left out"

### Requirement: Checks on save
Saving a form SHALL normalise section and field keys to lower-case kebab-case and SHALL reject: duplicate keys, reserved keys, rules or next-step targets pointing at missing keys, next-step loops, field tokens in email to, cc, bcc or from addresses, a visitor copy whose address field is not an email field, upload fields on a form that does not store, and webhook URLs that are not https.

#### Scenario: Keys are normalised
- **WHEN** a field is saved with key ` Project Type `
- **THEN** it is stored as `project-type`
- **CHECK** tests/int/form-save.int.test.ts › "keys are normalised to kebab-case"

#### Scenario: Broken references are rejected
- **WHEN** a show/hide rule points at a field key the form does not have, or two fields share a key
- **THEN** the save fails with a message naming the key
- **CHECK** tests/int/form-save.int.test.ts › "missing rule keys and duplicate keys are rejected"

#### Scenario: Step loops are rejected
- **WHEN** section A's next-step rule targets B and B's targets A
- **THEN** the save fails with a message naming the loop
- **CHECK** tests/int/form-save.int.test.ts › "next-step loops are rejected"

#### Scenario: Tokens in addresses are rejected
- **WHEN** an email output's `to` is `{{email}}` or `team@example.com, {{other}}`
- **THEN** the save fails and says to use a visitor copy instead
- **CHECK** tests/int/form-save.int.test.ts › "field tokens in email addresses are rejected"

#### Scenario: Uploads need storing and https webhooks
- **WHEN** a form with a file upload field has store off, or a webhook URL starts with `http://`
- **THEN** the save fails naming the field or the URL
- **CHECK** tests/int/form-save.int.test.ts › "uploads without storing and http webhooks are rejected"

#### Scenario: Reserved keys are rejected
- **WHEN** a field key is the honeypot or Turnstile field name
- **THEN** the save fails naming the key
- **CHECK** tests/int/form-save.int.test.ts › "reserved keys are rejected"

### Requirement: Access
Anyone SHALL read published forms, without their delivery settings, which only logged-in users read; webhook headers and signing secrets SHALL be read and written only by users the `access.isAdmin` option allows (default: any logged-in user). Nobody SHALL create submissions or attachments through REST or GraphQL; logged-in users SHALL read them; only admins SHALL update or delete them.

#### Scenario: Visitors see the form but not its delivery
- **WHEN** an anonymous request reads a published form
- **THEN** it gets sections and words but no email outputs, webhooks or WhatsApp settings, and drafts are not returned
- **CHECK** tests/int/access.int.test.ts › "anonymous read hides delivery settings and drafts"

#### Scenario: Secrets are admin-only
- **WHEN** a logged-in user that `access.isAdmin` rejects reads a form
- **THEN** webhook headers and signing secrets are missing from the response
- **CHECK** tests/int/access.int.test.ts › "webhook secrets are hidden from non-admins"

#### Scenario: No public writes to submissions or attachments
- **WHEN** an anonymous REST request creates a submission or an attachment
- **THEN** Payload answers 403 and nothing is stored
- **CHECK** tests/int/access.int.test.ts › "anonymous create of submissions and attachments is refused"

### Requirement: Submission and attachment records
A submission SHALL hold its form, the answers, a snapshot of section title, label and value per answer as worded at that time, its attachments, a status (received, processed, partly failed, failed), the delivery log and the user agent; the IP SHALL be stored only when the `metadata.ip` option is on. An attachment SHALL be a private upload linked to its form, submission and field key.

#### Scenario: Snapshot keeps the words of the day
- **WHEN** a submission is stored and the field's label is changed afterwards
- **THEN** the submission's snapshot still shows the old label
- **CHECK** tests/int/submit.int.test.ts › "snapshot keeps the label used at submission"

#### Scenario: IP only when asked
- **WHEN** a submission is stored with default options, and again with `metadata: { ip: true }`
- **THEN** the first has no IP and the second has the request's `cf-connecting-ip`
- **CHECK** tests/int/submit.int.test.ts › "IP is stored only with metadata.ip"

### Requirement: Field order inside a question
Inside every input block, what the question is SHALL come first (key row, words, the type's own fields such as options, limits and upload settings), then the default and prefill row, and the show/hide rules SHALL come last. Field types an app adds SHALL put their own fields before the default and prefill row and the rules. No field SHALL be renamed: the order changes, the stored names do not.

#### Scenario: Rules come last in every built-in block
- **WHEN** the test reads the top-level fields of each built-in input block (rows and collapsibles opened)
- **THEN** `visibilityRules` is the last data field, and for radio and select `options` comes before `defaultValue`, `prefillParam` and `visibilityRules`
- **CHECK** tests/plugin-config.test.ts › "rules come last in every built-in input block"

#### Scenario: App field types put their fields before the rules
- **WHEN** an app registers a field type whose block has a `rating` number field
- **THEN** the block's fields are the key row and words, then `rating`, then the default and prefill row, then `visibilityRules`
- **CHECK** tests/plugin-config.test.ts › "app field types put their own fields before the rules"

#### Scenario: Field names are unchanged
- **WHEN** the test flattens every data path of every built-in block and compares it with the 0.3.0 list in tests/fixtures/field-paths-0.3.0.json
- **THEN** every 0.3.0 path is still there, and the only new paths are `prefillFromKey` in each input block and `mode`, `valueFormat` and `displayStyle` in the date block
- **CHECK** tests/plugin-config.test.ts › "field names are unchanged from 0.3.0 apart from the listed new fields"

### Requirement: Checkboxes level with the inputs
A checkbox that shares a row with inputs SHALL carry the plugin's shared level style in `admin.style`: a question's `required`, the single checkbox question's `defaultValue` (it shares the prefill row), and the `enabled` of each email and webhook row. Names, defaults and widths SHALL stay as in 0.3.0.

#### Scenario: Row checkboxes carry the level style
- **WHEN** the test reads `required` in every input block, `defaultValue` in the checkbox block and `enabled` in the email and webhook rows
- **THEN** each has `admin.style` equal to `LEVEL_CHECKBOX_STYLE`, and its name, default and width are unchanged
- **CHECK** tests/plugin-config.test.ts › "row checkboxes carry the level style"

### Requirement: At least two choices for radio and select
A radio or select question SHALL have at least two choices: typed options SHALL have `minRows: 2`, and saving SHALL refuse a radio or select whose typed choices number fewer than two or that picks exactly one collection item. An empty pick SHALL never be counted or refused, so a save never depends on another collection's publish state. Checkbox groups SHALL keep allowing one option.

#### Scenario: One typed choice is refused
- **WHEN** a form is saved with a radio, or a select, that has one typed option
- **THEN** the save fails with a message naming the question and saying it needs at least 2 choices; with two options it saves
- **CHECK** tests/int/form-save.int.test.ts › "radio and select need at least two typed choices"

#### Scenario: One picked item is refused
- **WHEN** a radio, or a select, takes its choices from a collection and exactly one item is picked
- **THEN** the save fails with the same message; with two picked items it saves, and with none picked it saves even when the collection has only one published item
- **CHECK** tests/int/form-save.int.test.ts › "radio and select refuse a single picked item"

#### Scenario: Checkbox group keeps one option
- **WHEN** a checkbox group with one typed option is saved
- **THEN** it saves, and the typed options of radio and select have `minRows: 2` while the checkbox group's have none
- **CHECK** tests/int/form-save.int.test.ts › "a checkbox group may have one option"; tests/plugin-config.test.ts › "radio and select options have minRows 2"

### Requirement: New forms start step by step
A new form's presentation mode SHALL start as "Step by step"; "Single page" SHALL stay an option. A saved form SHALL keep its saved mode.

#### Scenario: New form defaults to step by step
- **WHEN** a form is created without a presentation mode
- **THEN** it is stored with `presentationMode: 'steps'`, and the field's options are "Step by step" and "Single page"
- **CHECK** tests/int/form-save.int.test.ts › "new forms default to step by step"

#### Scenario: Saved single-page form keeps its mode
- **WHEN** a form saved with `singlePage` is updated without sending a presentation mode
- **THEN** it still reads `singlePage`, and the public read returns `singlePage`
- **CHECK** tests/int/form-save.int.test.ts › "saved single-page forms keep their mode"

### Requirement: Keys formatted as you type
The admin inputs for a question key and a section key SHALL format the text to lower-case kebab-case on every change, keeping one trailing dash while typing, and SHALL keep the caret after the characters typed. Saving SHALL still normalise keys.

#### Scenario: Formatter matches the save normalisation
- **WHEN** `formatKeyInput` gets ` Project Type`, `Project_Type!`, `--a  b--` and `Ñame 2`
- **THEN** it returns `project-type`, `project-type-`, `a-b-` and `ame-2`, and with a trailing dash removed each result equals `normalizeKey` of the same text
- **CHECK** tests/admin-logic.test.ts › "key formatter matches normalizeKey"

#### Scenario: Caret stays after the typed text
- **WHEN** `caretAfterFormat` gets `Project Type` with the caret after `Project T`
- **THEN** it returns the offset after `project-t` in the formatted text
- **CHECK** tests/admin-logic.test.ts › "caret stays after the typed characters"

#### Scenario: Key field formats on change
- **WHEN** the key field component is rendered on a question and receives the change `Project Type`
- **THEN** the form value becomes `project-type`, and the field config of `fieldKey` and the section `key` names `payload-dynamic-forms/client#KeyField`
- **CHECK** tests/admin/key-field.test.tsx › "key field formats the value as you type"; tests/plugin-config.test.ts › "key fields use the KeyField component"

### Requirement: References are pick-lists
A rule's field key and a next-step rule's target section SHALL be chosen from lists built from the current form state, including unsaved edits. Stored values SHALL stay text. A stored value no longer in the form SHALL stay visible, and the save check SHALL still refuse it.

#### Scenario: Rule key picks from the form's keys
- **WHEN** the form state has questions `name`, `need` (choices from a collection) and a heading, and the rule key component renders
- **THEN** the choices are `name` and `need` in form order, picking `need` shows the attribute input, and typing `fieldSet` stores `need.fieldSet`
- **CHECK** tests/admin/pick-lists.test.tsx › "rule key lists the form's input keys and keeps the attribute"

#### Scenario: Next section picks from the other sections
- **WHEN** the form state has sections `about`, `details` and `done`, and the target component renders in `details`
- **THEN** the choices are `about` and `done`
- **CHECK** tests/admin/pick-lists.test.tsx › "next section lists the other sections"

#### Scenario: Unsaved keys appear at once
- **WHEN** a question's key in the form state changes from `need` to `topic` without saving
- **THEN** the rule key choices show `topic` and not `need`
- **CHECK** tests/admin/pick-lists.test.tsx › "pick-lists follow unsaved keys"

#### Scenario: Stale value stays visible
- **WHEN** a rule's stored key is `old-key`, which the form no longer has
- **THEN** the list shows `old-key (not in this form)` selected, and saving the form fails naming `old-key`
- **CHECK** tests/admin/pick-lists.test.tsx › "a stored key not in the form stays visible"; tests/int/form-save.int.test.ts › "missing rule keys and duplicate keys are rejected"

### Requirement: Hint under optional radio questions
An optional radio question SHALL show editors a description under its choices saying visitors can't clear a radio answer and suggesting a "None of the above" or "Not sure" choice when no answer is valid. It SHALL store nothing and add no visitor code.

#### Scenario: Hint shows only while the radio is optional
- **WHEN** the test reads the radio block and evaluates the hint's condition with `required` false and true
- **THEN** a `ui` field `noAnswerHint` sits after the choice fields, its condition is true then false, select and checkbox group have no such field, and the component renders the text naming "None of the above" and "Not sure"
- **CHECK** tests/plugin-config.test.ts › "optional radio questions carry the no-answer hint"; tests/admin/no-answer-hint.test.tsx › "hint names none of the above and not sure"

### Requirement: Defaults match the question type
A question's default SHALL use the question's own type: text and long text keep a localized text default; email a non-localized email field; number a non-localized text field holding a number, edited with a number input; date a non-localized text field edited with a mode-aware picker; select and radio a non-localized text field picked from the question's options; checkbox group several option values. Option values, numbers and dates SHALL NOT be localized.

#### Scenario: Default fields per type
- **WHEN** the test reads `defaultValue` in every built-in input block
- **THEN** text and textarea have a localized `text` field; email has `type: 'email'` without `localized`; number, date, select, radio and checkbox group have `type: 'text'` without `localized`, number with `payload-dynamic-forms/client#NumberDefaultField`, date with `#DateValueField`, select, radio and checkbox group with `#DefaultChoiceField` (checkbox group in multi mode through its client props); checkbox and file upload are as in 0.4.0; no option `value`, `min`, `max`, `minDate` or `maxDate` is localized
- **CHECK** tests/plugin-config.test.ts › "default fields match the question type"

#### Scenario: Typed defaults are the same in every locale
- **WHEN** a form is saved in `en` with a select default `b`, a number default `12`, a date default `2026-12-01` and an email default `team@example.com`, then read in `es`
- **THEN** the `es` read returns the same four values, and the public form gives the number default as the number `12`
- **CHECK** tests/int/form-save.int.test.ts › "typed defaults are the same in every locale"

#### Scenario: Choice default picks from the question's options
- **WHEN** the default component renders for a radio question whose form state holds options `Quote = quote` and `Visit = visit`, an option is added without saving, and a value is picked
- **THEN** it lists `Quote = quote`, `Visit = visit` and the new option, stores the picked value, and a stored value not in the options is listed as "<value> (not in the options)"; in multi mode (checkbox group) it stores several picked values joined by `,`
- **CHECK** tests/admin/default-fields.test.tsx › "choice default lists the question's options"; tests/admin/default-fields.test.tsx › "checkbox group default picks several options"

#### Scenario: Collection choice default picks from the chosen items
- **WHEN** the default component renders for a select question taking its choices from a collection, with two picked items, and again with an empty pick
- **THEN** it requests those two items by id (and with an empty pick, the collection's items) through the REST API with `depth=0` and `draft=true`, and lists each by its label field = value field
- **CHECK** tests/admin/default-fields.test.tsx › "collection default lists the picked items"

#### Scenario: Date values are pickers with Today
- **WHEN** the date value component renders for a question in each mode, a date and time is picked, and "Today" (Date) or "Now" (Date and time, Time) is chosen; and the conversion gets a Date-mode pick as the picker hands it over (12:00 UTC on 1 Dec 2026) with the runtime zone `Pacific/Auckland`
- **THEN** the picker uses `pickerAppearance` `dayOnly`, `dayAndTime` or `timeOnly` (`dayOnly` when the mode is empty) with `displayFormat` `yyyy-MM-dd`, `yyyy-MM-dd HH:mm` or `HH:mm` and, with a time, `timeFormat` `HH:mm` and `timeIntervals` 15; it stores `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM` or `HH:MM` from the pick, and `today` for the relative choice; on a Time question's limits no "Now" is offered; in Auckland the pick reads `2026-12-01`, and `2026-12-01` gives a picker value on 1 Dec local time
- **CHECK** tests/admin/default-fields.test.tsx › "date value field writes the mode's format and today"; tests/admin-logic.test.ts › "date picker values convert to wall-time text both ways"

#### Scenario: Number default uses a number input
- **WHEN** the number default component renders for a question with Min 1 and Max 10 and the editor types `7`
- **THEN** the input is `type="number"` with `min="1"` and `max="10"`, and the stored value is the text `7`; empty stores no default
- **CHECK** tests/admin/default-fields.test.tsx › "number default is a number input inside min and max"

### Requirement: Defaults and limits are checked on save
Saving a form SHALL refuse a default or date limit that doesn't fit its question (type, mode, Min/Max, length limits, the question's options, or for collection choices the picked items, else the collection's items) and Earliest after Latest, with a message at that field's path. Empty defaults SHALL always be accepted.

#### Scenario: Defaults that don't fit are refused
- **WHEN** forms are saved, one at a time, with an email default `not-an-email`, a number default `20` with Max 10, a date default `12/01/2026`, a Time question's default `2026-12-01`, a date question with Earliest `2026-12-10` and Latest `2026-12-01`, a Time question with Earliest `today`, a select default `maybe` with options `yes` and `no`, a checkbox-group default `a,z` with options `a` and `b`, and a text default of 12 characters with Max length 10
- **THEN** each save is refused with a message naming the question at that question's `defaultValue`, `minDate` or `maxDate` path, and nothing is stored
- **CHECK** tests/int/form-save.int.test.ts › "defaults that don't fit their question are refused"

#### Scenario: Collection choice defaults must be one of the items
- **WHEN** a select taking its choices from a collection is saved with a default that is the value of an unpicked item while two others are picked, then with the value of a picked draft item, then with an empty pick and the value of any item of that collection
- **THEN** the first save is refused at the question's `defaultValue`, and the second and third are stored
- **CHECK** tests/int/form-save.int.test.ts › "collection choice defaults must be one of the items"

#### Scenario: Defaults that fit are kept
- **WHEN** a form is saved with an email default `team@example.com`, number `5` with Min 1 and Max 10, date default `today` and limits `today` and `2027-01-31`, a Time question with default `09:30`, a select default `no`, a checkbox-group default `a,b` and empty defaults elsewhere
- **THEN** the save succeeds and reads back the same values
- **CHECK** tests/int/form-save.int.test.ts › "defaults that fit their question are kept"

### Requirement: Date questions have a mode
The date block SHALL have `mode` (Date `dayOnly`, Date and time `dayAndTime`, Time `timeOnly`), `valueFormat` (`local` as the browser sends it, or `utc`, shown only for Date and time) and `displayStyle` (`asStored`, `short`, `medium`, `long`), before the limits and the default row. Each SHALL have a function default (`dayOnly`, `local`, `asStored`), so no column default is added and a stored `NULL` reads as that default.

#### Scenario: Date settings and their defaults
- **WHEN** the test reads the date block
- **THEN** `mode`, `valueFormat` and `displayStyle` are selects with those values and labels "Asks for", "Stored as" and "In emails and messages", each `defaultValue` is a function returning `dayOnly`, `local` and `asStored`, `valueFormat` has a condition true only for `dayAndTime`, and all three come before `minDate`, `maxDate` and `defaultValue`
- **CHECK** tests/plugin-config.test.ts › "date questions have a mode, a stored format and a display style"

#### Scenario: New 0.5.0 fields add no database default
- **WHEN** the test reads `mode`, `valueFormat`, `displayStyle`, the form's `sendAnother` and `wording.sendAnother`
- **THEN** every `defaultValue` is a function, while the other Form wording fields keep their static defaults
- **CHECK** tests/plugin-config.test.ts › "new 0.5.0 fields have function defaults"

### Requirement: Every list starts open
Every array and blocks field the plugin adds SHALL use `initCollapsed: false` (Payload's default), so no plugin list falls back to closed after a new form's first save (the create view has no saved preferences); rows an editor closes stay readable through their labels.

#### Scenario: Every list starts open
- **WHEN** the test reads the forms and submissions collections (attachments on) and walks every array and blocks field
- **THEN** none has `admin.initCollapsed` true, and `sections`, `sections.fields`, both rule `rows` arrays, `nextStepRules`, `delivery.emails`, `delivery.webhooks`, webhook `headers`, typed `options`, `deliveryLog` and `snapshot` set it to false
- **CHECK** tests/plugin-config.test.ts › "every plugin list starts open"

### Requirement: Closed rows are readable
Every list row SHALL show its own words: sections `key · title`, questions `type · key · label` (heading and help text: `type · text`), rule rows the rule in words, options `label = value`, jumps `Jump to <section>`, email and webhook rows their label, each cut at 72 characters, else `Row N`. Array rows SHALL use the `RowLabel` component and every question block, built-in or app-defined, its own `QuestionLabel` block label, ported from the starter.

#### Scenario: Rows name their label components
- **WHEN** the test reads the forms collection with an app-defined field type registered
- **THEN** `sections`, both rule `rows` arrays, typed `options`, `nextStepRules`, `delivery.emails`, `delivery.webhooks` and webhook `headers` have `admin.components.RowLabel` pointing at `payload-dynamic-forms/client#RowLabel` with the matching `kind`; every block in `sections.fields`, the app type included, has `admin.components.Label` at `payload-dynamic-forms/client#QuestionLabel` with its singular label as `typeLabel`; and every admin component path in the collection starts with `payload-dynamic-forms/client#` and names an export of `src/exports/client.ts`
- **CHECK** tests/plugin-config.test.ts › "rows name their row label components"

#### Scenario: Row texts read the row's own values
- **WHEN** the row text functions get a section `{ key: 'contact', title: 'Your details' }`, a text question `{ fieldKey: 'full-name', words: { label: 'Full name' } }` of type `Text`, a heading `{ heading: 'About you' }`, a rule `{ fieldKey: 'need', operator: 'equals', value: 'quote' }`, a rule `{ fieldKey: 'email', operator: 'hasValue' }`, an option `{ label: 'Quote', value: 'quote' }`, a jump `{ targetSectionKey: 'details' }`, an email row `{ label: 'Team' }`, an 80-character title and an empty row at index 2
- **THEN** they give `contact · Your details`, `Text · full-name · Full name`, `Heading · About you`, `need equals quote`, `email has a value`, `Quote = quote`, `Jump to details`, `Team`, the first 72 characters followed by `…`, and `Row 3`
- **CHECK** tests/admin-logic.test.ts › "row texts read the row's own values"

#### Scenario: Array and block rows render their labels
- **WHEN** `RowLabel` renders with kind `section` for a row whose data is a section, and `QuestionLabel` renders with `typeLabel: 'Date'` for a block row whose data is a date question keyed `start`, labelled `Start date`
- **THEN** the array row shows `contact · Your details` and the block row shows `Date · start · Start date`
- **CHECK** tests/admin/row-labels.test.tsx › "array and block rows render their labels"

### Requirement: Rule and jump lists labelled in editors' words
Rule arrays SHALL be labelled "Rule"/"Rules" and keep the name `rows`. A rule's field key SHALL be labelled "Field". The next-step rules SHALL be labelled "Jump to section when" (singular "Jump", plural "Jumps") with the description "Skips every section in between, even ones whose show rules match.", and their target "Jump to section". Names SHALL stay unchanged, so no stored data moves.

#### Scenario: Rule arrays read Rules and keep their name
- **WHEN** the test reads the field show/hide group, the section show/hide group and the next-step rule
- **THEN** each has an array named `rows` with labels `{ singular: 'Rule', plural: 'Rules' }`
- **CHECK** tests/plugin-config.test.ts › "rule arrays are labelled Rules and still named rows"

#### Scenario: Jumps read Jump to section when
- **WHEN** the test reads the rule rows and the section's `nextStepRules`
- **THEN** each rule's `fieldKey` is labelled "Field"; `nextStepRules` has `label: 'Jump to section when'`, labels `{ singular: 'Jump', plural: 'Jumps' }`, the description "Skips every section in between, even ones whose show rules match." and its step-by-step condition; its `targetSectionKey` is labelled "Jump to section"; all names and `type: 'text'` unchanged
- **CHECK** tests/plugin-config.test.ts › "rule fields are labelled Field and jumps Jump to section when"

### Requirement: Hint under jumps that skip sections with show rules
Under a section's jumps, a hint SHALL name each section one of its jumps passes over (strictly between this section and the target, in form order) that has at least one show rule with a field key, built from the admin's form state (unsaved edits included), and SHALL render nothing when there is none.

#### Scenario: Skipped sections with show rules are found
- **WHEN** the pure function reads a form state with sections `a`, `b` (show rule on `kind`), `c` (no rules), `d`, where `a` jumps to `d`, from section index 0, and again from section index 2
- **THEN** it returns `[{ target: 'd', skipped: 'b' }]` from index 0 and an empty list from index 2; a show rule row with an empty field key doesn't count
- **CHECK** tests/admin-logic.test.ts › "jump hint lists skipped sections that have show rules"

#### Scenario: Hint names the skipped section
- **WHEN** the hint component renders for section `a` of that form state, and then after `b`'s show rule is removed from the form state
- **THEN** it first shows `Jump to “d” skips “b”, which has its own show rules.` followed by the advice to use show rules for an optional section, then renders nothing; the config places `jumpSkipHint` (a `ui` field, `payload-dynamic-forms/client#JumpSkipHint`) right after `nextStepRules`
- **CHECK** tests/admin/jump-hint.test.tsx › "jump hint names skipped sections with show rules"; tests/plugin-config.test.ts › "jump skip hint follows the jumps"

### Requirement: Submission records can't be edited
A submission's `form`, `answers`, `snapshot`, `attachments`, `deliveryLog` and `metadata` SHALL have field-level `access.update` returning false, so no API update changes them. `status` and `resendFailed` SHALL stay editable by admins. The plugin's own writes (delivery log after a submit, resend by endpoint or sidebar tick) SHALL keep updating the record.

#### Scenario: Record fields are read-only by access
- **WHEN** the test reads the submissions collection (attachments on)
- **THEN** `form`, `answers`, `snapshot`, `attachments`, `deliveryLog` and `metadata` each have `access.update` that returns false, and `status` and `resendFailed` have no field access
- **CHECK** tests/plugin-config.test.ts › "submission record fields are read-only by access"

#### Scenario: An admin can't edit a record, only its status
- **WHEN** an admin sends a REST `PATCH` for a stored submission changing `form` to another form, `answers`, `snapshot`, `deliveryLog`, `metadata.locale` and `status`, and the same through the Local API with that user and `overrideAccess: false`
- **THEN** each answer is 200 or a resolved update, `status` has the new value, and every other field reads exactly as before
- **CHECK** tests/int/access.int.test.ts › "submission records refuse edits, status stays editable"

#### Scenario: System writes still update the record
- **WHEN** a submission with a failing webhook is stored, the webhook is fixed, and an admin ticks "Resend failed deliveries" through REST; and another is resent through the resend endpoint
- **THEN** the delivery log and status written after the submit, after the tick and after the endpoint resend are all stored
- **CHECK** tests/int/delivery.int.test.ts › "status follows the delivery log"; tests/int/delivery.int.test.ts › "sidebar tick resends and clears itself"; tests/int/delivery.int.test.ts › "resend runs only failed outputs and updates status"
