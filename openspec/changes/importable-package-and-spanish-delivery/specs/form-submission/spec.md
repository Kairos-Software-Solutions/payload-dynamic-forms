## ADDED Requirements

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

## MODIFIED Requirements

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
