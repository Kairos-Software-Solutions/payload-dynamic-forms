# form-submission Specification

## Purpose
The server side of a visitor sending a form: reading a public form, and the submit endpoint that checks every answer, spam, rate and file rule on the server before anything is stored or sent.

## Requirements

### Requirement: Public form read
The plugin SHALL provide `getPublicForm(payload, slug, { draft, locale, req, user })` and `GET /api/<forms>/public/:slug`, returning a published form with its sections, words filled from the defaults where empty, choices from sources resolved with their attributes, and its WhatsApp number when WhatsApp delivery is on, and nothing else of its delivery settings. An unknown or unpublished slug SHALL give 404, except where a draft read is allowed (Draft read for previews).

#### Scenario: Public form is ready to render
- **WHEN** a published form with a source-based choice, an empty word and WhatsApp delivery is read through the endpoint
- **THEN** the response has the resolved choices with attributes, the default for the empty word, the WhatsApp number, and no email outputs, webhooks or secrets
- **CHECK** tests/int/submit.int.test.ts › "public read resolves choices and words and hides delivery"

#### Scenario: Drafts and unknown slugs are not found
- **WHEN** an anonymous request asks the endpoint, with and without `?draft=true`, for a draft-only form or an unknown slug
- **THEN** it answers 404 with the default not-found words
- **CHECK** tests/int/submit.int.test.ts › "public read of drafts and unknown slugs is 404"

### Requirement: Submit endpoint
The plugin SHALL provide `POST /api/<forms>/submit/:slug`, taking multipart form data (needed for files) or JSON. It SHALL find the published form, refuse a closed form with 409 and its closed words, run the spam checks and rate limit, run the shared answer checks on the step path, and answer 400 with field errors keyed by field key, or 200 with the success words or redirect URL, the submission id when stored, and the wa.me URL when WhatsApp delivery is on.

#### Scenario: Valid answers are accepted
- **WHEN** a visitor posts valid answers to an open, storing form
- **THEN** the endpoint answers 200 with the success words and the submission id, and one submission with those answers exists
- **CHECK** tests/int/submit.int.test.ts › "valid answers are stored and answered with success words"

#### Scenario: Invalid answers are refused with field errors
- **WHEN** a visitor posts an empty required field and a malformed email
- **THEN** the endpoint answers 400 with both field keys in `fieldErrors`, worded by each field's error words, and nothing is stored or sent
- **CHECK** tests/int/submit.int.test.ts › "invalid answers give field errors and store nothing"

#### Scenario: Server enforces rules the browser could skip
- **WHEN** a request posts answers for a hidden field and leaves out a visible required one, bypassing any renderer
- **THEN** the hidden answer is dropped and the endpoint answers 400 for the visible required field
- **CHECK** tests/int/submit.int.test.ts › "server applies show/hide and required without the renderer"

#### Scenario: Closed form
- **WHEN** a visitor posts to a form whose intake is closed
- **THEN** the endpoint answers 409 with the form's closed words and stores nothing
- **CHECK** tests/int/submit.int.test.ts › "closed form answers 409 with its words"

#### Scenario: Success by redirect
- **WHEN** the form's success is a redirect URL
- **THEN** the 200 response carries that URL
- **CHECK** tests/int/submit.int.test.ts › "redirect success returns the URL"

### Requirement: Spam checks on the server
When a form stores or sends anything, the endpoint SHALL refuse a filled honeypot field and, when the plugin's `turnstile` option is on, a missing or invalid Turnstile token, verified through Cloudflare's siteverify with the secret, the token, the visitor IP and an idempotency key. Turnstile on with no secret SHALL refuse every submission and log one line. A form that only builds a WhatsApp link SHALL skip both checks.

#### Scenario: Honeypot filled
- **WHEN** a request fills the honeypot field
- **THEN** the endpoint answers 400 with the generic error words, and nothing is stored or sent
- **CHECK** tests/int/submit.int.test.ts › "filled honeypot stores and sends nothing"

#### Scenario: Turnstile verified on the server
- **WHEN** Turnstile is on and siteverify answers `success: false`, or the token is missing
- **THEN** the endpoint answers 400 with the security-check words; with `success: true` it goes on, and the siteverify request carried the secret, token, IP and an idempotency key
- **CHECK** tests/turnstile.test.ts › "siteverify gets secret, token, ip and idempotency key and its answer decides"

#### Scenario: Turnstile without a secret fails closed
- **WHEN** Turnstile is on but its secret is empty
- **THEN** every submission is refused with the security-check words and one error line is logged
- **CHECK** tests/turnstile.test.ts › "missing secret refuses submissions and logs once"

#### Scenario: WhatsApp-only forms skip spam checks
- **WHEN** a form with store off and only WhatsApp delivery is submitted without a Turnstile token
- **THEN** the endpoint answers 200 with the wa.me URL
- **CHECK** tests/int/submit.int.test.ts › "whatsapp-only forms skip turnstile and rate limit"

### Requirement: Rate limit
When a form stores or sends anything, the endpoint SHALL allow at most `rateLimit.max` submissions per form per visitor in `rateLimit.windowSeconds` (default 5 in 600), counted in Payload's KV store under a hash of the visitor IP, never the raw IP, and SHALL answer 429 with the too-many-tries words beyond that. `rateLimit: false` SHALL turn it off.

#### Scenario: Over the limit
- **WHEN** one IP posts 6 valid submissions to a form within the window with the default limit
- **THEN** the first 5 are accepted and the 6th answers 429 with the too-many-tries words; another IP is still accepted
- **CHECK** tests/int/submit.int.test.ts › "sixth submission in the window answers 429"

#### Scenario: KV keys hold no raw IP
- **WHEN** a submission from `203.0.113.7` is counted
- **THEN** no KV key or value contains `203.0.113.7`
- **CHECK** tests/int/submit.int.test.ts › "rate limit keys hold a hash, not the IP"

### Requirement: Attachments
File-upload fields SHALL accept the files a field allows (count, MIME types, size; defaults one file, 10 MB, PDF, images, text, CSV, Word), with at most 25 MB per submission. The server SHALL create each file in the attachments collection, link it to the submission and field, and delete files already created when the submission cannot be stored.

#### Scenario: Files are stored privately and linked
- **WHEN** a visitor posts two allowed files to a field that allows two
- **THEN** two attachments exist, each linked to the submission and the field key, the submission lists them, and an anonymous read of either is refused
- **CHECK** tests/int/attachments.int.test.ts › "allowed files are stored, linked and private"

#### Scenario: Wrong type, size or count
- **WHEN** a file has a type the field doesn't allow, is over its size, the field gets more files than it allows, or the files total more than 25 MB
- **THEN** the endpoint answers 400 with the file words on that field and creates no attachment
- **CHECK** tests/int/attachments.int.test.ts › "wrong type, size, count or total creates no attachment"

#### Scenario: No orphan files
- **WHEN** storing the submission fails after its files were created
- **THEN** those files are deleted and the endpoint answers with the generic error words
- **CHECK** tests/int/attachments.int.test.ts › "files are removed when the submission fails"

#### Scenario: App's own upload collection
- **WHEN** the plugin runs with `attachments: { collection: 'private-files' }` naming an existing upload collection
- **THEN** the plugin adds its link fields to that collection instead of creating its own, and fails at boot if the collection is not an upload collection
- **CHECK** tests/plugin-config.test.ts › "attachments can use the app's upload collection"

### Requirement: Draft read for previews
`getPublicForm` with `draft: true` and a user (or `req.user`), and the public endpoint with `?draft=true` on a logged-in request, SHALL return the form's newest draft when that user's own read of the forms collection with drafts returns it, with option-source items read as drafts. Otherwise they SHALL return the published read. Every `?draft=true` answer SHALL carry `Cache-Control: private, no-store`. The submit endpoint SHALL read the published form only.

#### Scenario: Logged-in draft read returns the newest draft
- **WHEN** a published form's send word is `Send`, a newer draft sets it to `Send draft` and adds a section, and `getPublicForm` runs with `{ draft: true, user: <editor> }`, then without `draft`, then with `draft: true` and no user
- **THEN** the first returns `Send draft` and the new section; the second and third return `Send` without it
- **CHECK** tests/int/draft-read.int.test.ts › "a logged-in draft read returns the newest draft"

#### Scenario: Anonymous draft requests get the published form
- **WHEN** an anonymous request calls `GET /api/custom-forms/public/<slug>?draft=true` for that form and for a draft-only form, and `getPublicForm(payload, <draft-only slug>, { draft: true })` runs with no user
- **THEN** the first answers 200 with `Send`, the second 404 with the default not-found words, and the call returns null
- **CHECK** tests/int/draft-read.int.test.ts › "anonymous draft requests get the published form"

#### Scenario: Read access decides
- **WHEN** the app overrides the forms read access to `true` for admins and published-only for everyone else, and an editor and an admin each read the form with `draft: true`
- **THEN** the editor gets `Send` and the admin gets `Send draft`, and neither read throws
- **CHECK** tests/int/draft-read.int.test.ts › "a user the read access refuses gets the published form"

#### Scenario: Endpoint drafts are never cached
- **WHEN** a request with an editor's token calls the public endpoint with `?draft=true` for the form and for a draft-only form, and another calls it without `draft`
- **THEN** both draft answers are 200 with the draft words and `Cache-Control: private, no-store`; the plain answer has `Send` and no `no-store`
- **CHECK** tests/int/draft-read.int.test.ts › "public endpoint serves drafts to logged-in requests, never cached"

#### Scenario: Option-source items read as drafts
- **WHEN** a radio picks a topic whose published label is `Repairs` and whose newer draft label is `Repairs and care`, and a never-published topic, and the form is read with and without a logged-in draft read
- **THEN** the draft read lists `Repairs and care` and the never-published topic; the published read lists `Repairs` only
- **CHECK** tests/int/draft-read.int.test.ts › "a draft read reads option-source items as drafts"

#### Scenario: Submit ignores drafts
- **WHEN** a form's published success words are `Thanks` and its newer draft's are `Thanks draft`, and a request with an editor's token submits it, then submits a draft-only form
- **THEN** the first answers 200 with `Thanks`, and the second 404 with nothing stored or sent
- **CHECK** tests/int/draft-read.int.test.ts › "submit ignores drafts, also for logged-in users"

### Requirement: Request locale
The public endpoint, the submit endpoint and resend SHALL use a locale only when it is one of the app's locale codes, and the app's default locale otherwise, including `all` and `*`. A stored submission SHALL keep that locale. Without localization they SHALL pass no locale and store none.

#### Scenario: Unknown or all locale reads the default locale
- **WHEN** a visitor submits with `?locale=all`, another with `?locale=xx`, and the public endpoint is read with `?locale=all`
- **THEN** both submissions answer 200 with the English success words as a string and store locale `en`, and the public read's words are strings
- **CHECK** tests/int/submit.int.test.ts › "unknown or all locale reads and stores the default locale"

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
- **WHEN** a published form's date question has `mode`, `value_format` and `display_style` set to NULL straight in the database (as a 0.4.0 row reads if a site skipped the migration's backfill), the public form is read and `2026-11-12` is submitted
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
