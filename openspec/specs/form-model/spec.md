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
- **THEN** every 0.3.0 path is still there, and the only new paths are `prefillFromKey` in each input block
- **CHECK** tests/plugin-config.test.ts › "field names are unchanged from 0.3.0 apart from prefillFromKey"

### Requirement: Rule lists labelled Rules
The arrays of rules in a show/hide group and in a next-step rule SHALL be labelled "Rule" (singular) and "Rules" (plural) and SHALL keep the name `rows`, so no stored data moves. A rule's field key SHALL be labelled "Field" and a next-step rule's target "Next section", with their names unchanged.

#### Scenario: Rule arrays read Rules and keep their name
- **WHEN** the test reads the field show/hide group, the section show/hide group and the next-step rule
- **THEN** each has an array named `rows` with labels `{ singular: 'Rule', plural: 'Rules' }`
- **CHECK** tests/plugin-config.test.ts › "rule arrays are labelled Rules and still named rows"

#### Scenario: Rule fields read Field and Next section
- **WHEN** the test reads the rule rows of the field show/hide group, the section show/hide group and the next-step rule
- **THEN** each rule's `fieldKey` has the label "Field" and the next-step rule's `targetSectionKey` has the label "Next section", both still `type: 'text'` with those names
- **CHECK** tests/plugin-config.test.ts › "rule fields are labelled Field and Next section"

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
