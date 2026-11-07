# Spec Delta: form-submission

## Purpose

The server side of a visitor sending a form: reading a public form, and the submit endpoint that checks every answer, spam, rate and file rule on the server before anything is stored or sent.

## ADDED Requirements

### Requirement: Public form read
The plugin SHALL provide `getPublicForm(payload, slug, { locale })` and `GET /api/<forms>/public/:slug`, returning a published form with its sections, words filled from the defaults where empty, choices from sources resolved with their attributes, and its WhatsApp number when WhatsApp delivery is on, and nothing else of its delivery settings. An unknown or unpublished slug SHALL give 404.

#### Scenario: Public form is ready to render
- **WHEN** a published form with a source-based choice, an empty word and WhatsApp delivery is read through the endpoint
- **THEN** the response has the resolved choices with attributes, the default for the empty word, the WhatsApp number, and no email outputs, webhooks or secrets
- **CHECK** tests/int/submit.int.test.ts › "public read resolves choices and words and hides delivery"

#### Scenario: Drafts and unknown slugs are not found
- **WHEN** the endpoint is asked for a draft-only form or an unknown slug
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
