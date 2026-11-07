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
