# form-delivery Specification

## Purpose
What happens to accepted answers: storing them or not, email through the app's Payload email adapter, a WhatsApp link with nothing stored, webhooks, the tokens that fill templates, delivery after the reply, the delivery log and resending.

## Requirements

### Requirement: Store on or off
Each form SHALL have a store setting (on by default). With store on, accepted answers SHALL be saved as a submission before any delivery runs. With store off, no submission, attachment or log record SHALL be written, and email and webhook delivery still run.

#### Scenario: Store off writes nothing
- **WHEN** a form with store off and an email output is submitted
- **THEN** the email is sent, the response has no submission id, and the submissions and attachments collections stay empty
- **CHECK** tests/int/delivery.int.test.ts › "store off sends but writes no records"

### Requirement: Template tokens
Templates SHALL fill `{{key}}` for any field key, including keys with dashes and underscores, `{{key.attribute}}` for a chosen option's attribute, `{{formTitle}}`, `{{submissionId}}`, `{{*}}` as one "Label: value" line per answered visible field and `{{*:table}}` as an HTML table of the same rows. Unknown tokens SHALL become empty. Values SHALL be HTML-escaped in HTML output and line breaks removed in subjects.

#### Scenario: Keys with dashes fill in
- **WHEN** `New {{project-type}} request from {{full_name}}` is filled with `project-type: web` and `full_name: Ana`
- **THEN** it reads `New web request from Ana`
- **CHECK** tests/tokens.test.ts › "keys with dashes and underscores fill in"

#### Scenario: All answers as lines and table
- **WHEN** `{{*}}` and `{{*:table}}` are filled for answers where one visible field is empty and one field is hidden
- **THEN** both list only the answered visible fields with their labels, in form order, and the table escapes `<script>` in a value
- **CHECK** tests/tokens.test.ts › "star tokens list answered visible fields and escape html"

#### Scenario: Attributes, unknown tokens and subjects
- **WHEN** a template uses `{{need.opener}}`, `{{nope}}`, and a subject is filled with a value containing a line break
- **THEN** the opener of the chosen option fills in, `{{nope}}` is empty, and the subject has no line break
- **CHECK** tests/tokens.test.ts › "attributes fill, unknown tokens empty, subjects single-line"

### Requirement: Email delivery
Email outputs SHALL send through `payload.sendEmail`, so through whatever email adapter the app has. A team output SHALL send to its fixed addresses; a visitor copy SHALL send to the answer of the email field it names, only when that answer is one valid address. Reply-to MAY come from an email field. The `beforeEmail` option SHALL receive each message with the form and answers and return the message to send.

#### Scenario: Team email goes through the app's adapter
- **WHEN** a form with a team output to `team@example.com`, subject `New {{project-type}}` and body `{{*}}` is submitted
- **THEN** the dev app's email adapter receives one message to `team@example.com` with the filled subject and the answer lines
- **CHECK** tests/int/delivery.int.test.ts › "team email is sent through payload.sendEmail"

#### Scenario: Visitor copy only to one valid address
- **WHEN** a visitor copy names the `email` field and the answer is valid, then a request bypassing the field checks posts `a@b.com, c@d.com`
- **THEN** the first sends one message to that address; the second sends none and logs a failed attempt that names the invalid address
- **CHECK** tests/int/delivery.int.test.ts › "visitor copy sends only to one valid address"

#### Scenario: beforeEmail can change the message
- **WHEN** `beforeEmail` wraps the html in a layout
- **THEN** the adapter receives the wrapped html
- **CHECK** tests/int/delivery.int.test.ts › "beforeEmail changes the message"

#### Scenario: A failed email keeps the submission
- **WHEN** the email adapter throws
- **THEN** the submission is stored with status failed and a log entry holding the error, and the visitor still gets the success response
- **CHECK** tests/int/delivery.int.test.ts › "failed email keeps the submission and logs the error"

### Requirement: WhatsApp link
A form's WhatsApp delivery SHALL build a message from a template (default `{{*}}`) in which `{{*}}` is one row per answered visible field, formatted by a row template (default `*{{label}}:* {{value}}`) using each field's row label, and SHALL return `https://wa.me/<digits>?text=<encoded message>`. The number SHALL come from the form, else the plugin's `whatsapp.number` resolver. The shared helper and the endpoint SHALL give the same URL.

#### Scenario: Topic-driven message
- **WHEN** a form has a name field, a `need` choice from a topics source, item-set and service-set sections shown by `need.fieldSet`, and template `{{need.opener}}` + blank line + `{{*}}` + blank line + `{{need.closer}}`, and the visitor picks an item topic and leaves the link empty
- **THEN** the message is the topic's opener, the rows for name, item and any answered optional fields with their row labels, then the closer; no service-set row and no empty row appears
- **CHECK** tests/whatsapp.test.ts › "topic-driven message has opener, answered rows and closer"

#### Scenario: wa.me URL
- **WHEN** the number is `+1 (555) 000-1234` and the message has spaces, `*`, `&` and line breaks
- **THEN** the URL is `https://wa.me/15550001234?text=` followed by the message encoded with `encodeURIComponent`
- **CHECK** tests/whatsapp.test.ts › "url keeps digits only and encodes the message"

#### Scenario: Nothing stored, same URL as the helper
- **WHEN** that form (store off, WhatsApp only) is submitted to the endpoint
- **THEN** the response's wa.me URL equals the shared helper's for the same answers, and no submission, attachment or KV entry is written
- **CHECK** tests/int/delivery.int.test.ts › "whatsapp endpoint url matches the helper and stores nothing"

#### Scenario: Number from the resolver
- **WHEN** the form has no number and the plugin's `whatsapp.number` resolver returns one
- **THEN** the URL uses the resolver's number; with neither, the endpoint answers with the generic error words and logs one line
- **CHECK** tests/int/delivery.int.test.ts › "whatsapp number falls back to the resolver"

### Requirement: Webhook delivery
Webhook outputs SHALL send JSON (full: form, submission id, snapshot, attachments, answers; or answers only) by POST, PUT or PATCH with their secret headers, an optional `X-Form-Signature` HMAC-SHA256 over timestamp and body using an admin-only secret, a timeout (default 8 s) and up to 3 retries with a growing pause. A non-2xx answer or timeout SHALL count as a failed try.

#### Scenario: Signed request with secret headers
- **WHEN** a webhook with a secret header and a signing secret is delivered
- **THEN** the request has the header, and `X-Form-Signature: t=<unix seconds>,v1=<hex>` where hex is HMAC-SHA256 of `<t>.<body>` with the secret
- **CHECK** tests/webhook.test.ts › "request carries secret headers and a valid signature"

#### Scenario: Retries then gives up
- **WHEN** the endpoint answers 500 twice then 200, with retries 2; and another answers 500 three times with retries 2
- **THEN** the first is logged as one successful delivery after three tries; the second as failed with the last status in its error
- **CHECK** tests/webhook.test.ts › "retries until success or the limit"

#### Scenario: Timeout counts as a failure
- **WHEN** the endpoint does not answer within the timeout
- **THEN** the try is aborted and counted as failed
- **CHECK** tests/webhook.test.ts › "timeout aborts and counts as failed"

### Requirement: Delivery after the reply
The plugin SHALL take `delivery.schedule(task)`, letting an app run email and webhook delivery after the response is sent (for example with Next.js `after` or Workers `waitUntil`). Without it, delivery SHALL run before the response. Storing SHALL always finish before the response.

#### Scenario: Scheduled delivery
- **WHEN** `delivery.schedule` collects tasks instead of running them and a form with an email output is submitted
- **THEN** the response arrives with the submission stored as received and no email sent; running the collected task sends the email and sets the status to processed
- **CHECK** tests/int/delivery.int.test.ts › "scheduled delivery runs after the response"

### Requirement: Delivery log and status
Each email or webhook delivery of a stored submission SHALL add a log entry with kind, output id and label, target, result, error, tries and time. The status SHALL be processed when every delivery succeeded or there was none, partly failed when some failed, and failed when all failed.

#### Scenario: Status from the log
- **WHEN** a submission has one successful email and one failed webhook
- **THEN** its status is partly failed and its log has both entries with their output labels
- **CHECK** tests/int/delivery.int.test.ts › "status follows the delivery log"

### Requirement: Resend failed deliveries
Admins SHALL be able to resend a stored submission's failed deliveries through `POST /api/<submissions>/:id/resend` or by ticking "Resend failed deliveries" in the submission's sidebar and saving. Only outputs whose last try failed and that still exist on the form SHALL run again; new tries SHALL be added to the log and the status recomputed. Others SHALL get 403.

#### Scenario: Resend only what failed
- **WHEN** an admin resends a submission whose email succeeded and webhook failed, and the webhook now answers 200
- **THEN** only the webhook is sent again, the log gains one successful webhook entry, and the status becomes processed
- **CHECK** tests/int/delivery.int.test.ts › "resend runs only failed outputs and updates status"

#### Scenario: Resend from the sidebar
- **WHEN** an admin saves a submission with "Resend failed deliveries" ticked
- **THEN** the failed outputs run again and the box is saved unticked
- **CHECK** tests/int/delivery.int.test.ts › "sidebar tick resends and clears itself"

#### Scenario: Only admins resend
- **WHEN** an anonymous request or a user that `access.isAdmin` rejects calls the resend endpoint
- **THEN** it answers 403 and nothing is sent
- **CHECK** tests/int/delivery.int.test.ts › "resend refuses non-admins"
