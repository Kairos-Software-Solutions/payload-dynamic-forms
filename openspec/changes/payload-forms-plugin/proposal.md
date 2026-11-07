# Proposal: payload-forms-plugin

## Why

Kairos sites each carry their own forms code, and the copies have drifted: the Kairos website has a full custom forms engine (sections, steps, show/hide rules checked on the server, Turnstile, private attachments, a delivery log), a client site has a WhatsApp message form that stores nothing, and the site starter uses Payload's official form builder, which checks nothing on the server and has no show/hide rules. The reviewer decided on 7 Nov 2026 to make one open-source Payload plugin, published on public npm so nothing needs an install token, that any Payload app installs with one `plugin()` call. This change builds its first release (0.1.0) in a new repo, ready to publish once the reviewer says yes.

## What Changes

- New repo `kairos-payload-forms`, scaffolded by the builder from `npx create-payload-app@latest --template plugin`, converted to Yarn 4 and SQLite, with the template's sample code, admin components and Playwright e2e removed.
- The plugin `formsPlugin(options)`: an `enabled` flag (the starter can include it switched off), renameable slugs, collection overrides, a field-type registry in the official form builder's style (`true`/`false`/partial block/new block), option sources (choices from a collection), Turnstile, rate limit, attachments and delivery options.
- Three collections: forms (sections, field blocks, show/hide rules, steps, words, delivery settings; drafts and 20 versions), submissions (answers, a labelled snapshot, status, delivery log, resend) and attachments (private uploads, R2 on Kairos sites through the app's storage plugin).
- A shared rule engine and helpers that run the same way in the browser and on the server: visibility, required-while-visible, the step path, option attributes in rules, prefill from link parameters, answer checks, message and token building, the wa.me URL.
- Server endpoints: submit (validation, honeypot, Turnstile, rate limit, attachments, delivery), public form read, and an admin-only resend.
- Delivery: store on/off, email through `payload.sendEmail` with `{{field}}` (dashes allowed), `{{*}}` and `{{*:table}}` tokens and a guard on tokens in addresses, WhatsApp link (nothing stored), webhooks with retries, secret headers and a signature; delivery can run after the reply.
- A `formBlock()` helper so apps put a form on any page through a block that picks it.
- Tests (vitest unit tests and integration tests against the dev app on SQLite), README with install and a minimal rendering example, MIT LICENSE (pending the reviewer's call), CI (lint, typecheck, test, build, spec validation, pack check) and a publish workflow on `v*` tags that uses an `NPM_TOKEN` secret.

## Capabilities

### New Capabilities

- `plugin-setup`: installing the plugin, its options, the enabled flag, slugs, overrides, the field-type registry and the package entry points.
- `form-model`: the forms, submissions and attachments collections, their fields, words, access rules and the checks that run when a form is saved.
- `form-rules`: the shared rule engine: show/hide rules, required-while-visible, steps and their path, option attributes, prefill and answer checks.
- `form-submission`: the submit and public-read endpoints: validation on the server, spam checks, rate limit, closed forms and attachments.
- `form-delivery`: storing, email, tokens, WhatsApp links, webhooks, delivery after the reply, the delivery log and resend.
- `package-release`: README, LICENSE, package contents, CI and the publish workflow.

### Modified Capabilities

- None (new repo).

## Impact

- New public package `@kairos-software-solutions/payload-forms` 0.1.0 (name pending the reviewer's call on the npm scope). Peer `payload ^3.92.1`; developed and tested against Payload 3.92.1.
- Nothing live changes: no site installs it in this change, nothing is pushed or published.
- Source ported from the Kairos website's forms engine (read-only input); the website keeps running its own copy until a later change moves it.

## Out of scope

- A default renderer or any visitor-facing UI component. Each app renders its own forms; the README shows a minimal example.
- Moving the Kairos website, the client WhatsApp form or the site starter onto the plugin. Each is its own later change and plan; this change only proves, in tests, that a topic-driven WhatsApp form like the client's is one configuration.
- An admin field picker for rule keys, phone, hidden and consent field types, site-wide default words in a global, CSV export (import-export plugin), retention, minimum fill time, Payload jobs, and Payload 4 support.
- Running on Workers or D1 itself: tests run on SQLite in Node. The first site that installs it proves it on its QA link.
- Creating the GitHub repo, adding the `NPM_TOKEN` secret, publishing to npm, pushing: the planner does these only after the reviewer's yes.
