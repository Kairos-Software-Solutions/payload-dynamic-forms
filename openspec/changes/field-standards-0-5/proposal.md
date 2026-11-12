## Why

The reviewer tested payload-dynamic-forms 0.4.0 on the starter's test site (12 Nov 2026) and sent six points: defaults that don't match the question type, date questions that can't ask for a time, submissions whose linked form can be edited, a jump that hides a section whose show rule matches, rows that close while editing, and a "send another" choice on the success screen. He asked for the standards first; the research (`input/forms-plugin-0-5-standards.md`) compared Payload, Payload's official form builder, Google Forms, Qualtrics, Form.io, Gravity Forms, HTML and TC39 Temporal, and the reviewer took every recommendation, plus a follow-up on how date values are stored. This change plans those decisions as 0.5.0.

## What Changes

- **Typed defaults (point 1).** A question's default matches its type: text and long text stay localized text; email is a plain email field; number is a number inside Min/Max; date is a value in the question's mode or "Today"/"Now" (resolved in the visitor's browser); select and radio pick one of the question's own option values; checkbox group picks several; choices from a collection pick from the chosen items. Earliest/Latest limits become pickers with a "Today" choice. Option values, numbers and dates are never localized. Save refuses a default (or limit) that doesn't fit its question. Database columns keep their types (all text), so no table is rebuilt.
- **Date modes (point 2).** The date block gets a mode with Payload's names: Date (`dayOnly`, the default, so 0.4.0 questions behave as before), Date and time (`dayAndTime`), Time (`timeOnly`). Answers are kept exactly as the browser sends them (`YYYY-MM-DD`, `HH:MM`, `YYYY-MM-DDTHH:MM`) unless a Date and time question opts into a UTC instant; the renderer sends the visitor's IANA time zone (`_tz`), and a new plugin option `timezone` (default `UTC`) covers requests without one. Date-only and time-only answers are never converted. An optional display style (short, medium, long through `Intl.DateTimeFormat` in the message's language) shapes emails, WhatsApp text and the snapshot; webhooks always carry the stored value plus the time zone when recorded (new `metadata.timeZone` on submissions).
- **Submission records are read-only (point 3).** Field-level `access.update: () => false` on `form`, `answers`, `snapshot`, `attachments`, `deliveryLog` and `metadata`, enforced by Payload on every API, not only in the admin. Status and "Resend failed deliveries" stay editable; the plugin's own writes (delivery log, resend) keep working.
- **Jumps keep their meaning (point 4).** No engine change: a jump skips every section in between, as in Qualtrics, Google Forms and Microsoft Forms. The next-step rules are labelled "Jump to section when", described "Skips every section in between, even ones whose show rules match.", and a hint under them names each section a jump skips that has its own show rules. README section "Jumps and show rules".
- **Rows stay open and read clearly when closed (point 5).** The planner reproduced it in the dev app: on a new form, opened sections close after the first save, because the create view has no saved preferences and Payload falls back to the plugin's `initCollapsed: true`. Sections and questions now start open (Payload's default, as the starter already overrides). Rows are labelled through components ported from the starter: sections "key · title", questions "type · key · label", rule rows the rule in words, options "label = value", jumps, email and webhook rows by their own words. A second effect seen on the starter's test site (toggling rows while a save is in flight is undone on screen) is Payload core behaviour and is recorded, not changed.
- **"Send another" (point 6).** An opt-in checkbox under "Show the success words": "Show a 'Send another' button", default off, with its own localized words (`wording.sendAnother`, default "Send another"). The public form exposes both; each site's renderer resets the answers to their defaults and link prefill and returns to step 1 without a reload. README: Turnstile tokens are single use, so a renderer using Turnstile needs a fresh one.
- **Public API additions.** Plugin option `timezone`. Shared entry: `TIME_ZONE_FIELD`, `browserTimeZone()`, `resolveDateLimit()`, `formatAnswerDate()`, `toUtcInstant()`, `TODAY`, and an optional date context on `checkAnswers`, `initialAnswers`, `answerToText`, `buildSnapshot`, `buildMessageRows`, `buildTemplateValues` and `buildWhatsAppMessage`. Main entry: `carryOverDefault()` for the sites' upgrade migration. Public form: date `mode`, `valueFormat`, `displayStyle`, number defaults as numbers, `sendAnother`. Types: `FormWords.sendAnother`, `PublicForm.sendAnother`, `InputBlock.mode`/`valueFormat`/`displayStyle`.
- **Version 0.5.0** with a README migration note, date modes, jumps vs show rules, send another with the Turnstile note, and the changelog.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `form-model`: typed default fields and their save checks, date question settings, row labels and open sections/questions, jump labels and the skipped-section hint, read-only submission records; the field-name fixture allows the new date settings.
- `form-rules`: date answers checked per mode, starting answers for typed defaults ("Today", choice defaults inside the options, numbers), jumps skip sections with matching show rules (pinned, unchanged).
- `form-submission`: date-time storage (as sent or UTC with the visitor's zone), the public form's new settings, send another.
- `form-delivery`: dates in emails, WhatsApp text and the snapshot; webhooks carry the stored value and the zone.
- `plugin-setup`: the `timezone` option and the `carryOverDefault` helper.
- `package-release`: version 0.5.0 and the README's 0.5.0 notes.

## Impact

- Code: `src/collections/blocks.ts`, `forms.ts`, `ruleFields.ts`, `submissions.ts`, `src/hooks/validateForm.ts`, `src/shared/answers.ts`, `rules.ts`, `tokens.ts`, `whatsapp.ts`, `types.ts`, `words.ts`, new `src/shared/dates.ts`, `src/server/forms.ts`, `src/endpoints/submit.ts`, `src/delivery/run.ts`, `src/server/resend.ts`, `src/index.ts`, `src/types.ts`, new `src/upgrade/carryOverDefault.ts`, new admin components under `src/admin/`, `src/exports/client.ts`, `src/exports/shared.ts`, `src/index.ts` exports, `scripts/check-packed.mjs`, `dev/app/(payload)/admin/importMap.js` (regenerated), `package.json`, `README.md`.
- Tests: `tests/plugin-config.test.ts`, `tests/admin-logic.test.ts`, `tests/answers.test.ts`, `tests/rules.test.ts`, `tests/steps.test.ts`, `tests/readme.test.ts`, `tests/package.test.ts`, `tests/int/form-save.int.test.ts`, `tests/int/submit.int.test.ts`, `tests/int/access.int.test.ts`, `tests/int/delivery.int.test.ts`, `tests/admin/payload-ui-mock.tsx`, new `tests/dates.test.ts`, `tests/carry-over.test.ts`, `tests/admin/default-fields.test.tsx`, `tests/admin/row-labels.test.tsx`, `tests/admin/jump-hint.test.tsx`.
- Schema for sites (design › Migration impact for sites): new nullable columns only (date block settings and defaults moved out of `_locales`, send another, its words, `metadata.timeZone`), plus a data copy of the default-language default for email, number, date, select and radio questions. SQLite and D1 sites hand-write it; Postgres edits the generated one so the copy runs before any column drop.
- Sites regenerate their admin import map after upgrading (new client components).
- Visitor renderers: no change needed to keep working; the starter adopts date modes, typed defaults and Send another in its pin plan.

## Out of scope

- The starter's renderer changes (date mode inputs, "Today" defaults, the Send another button, sending `_tz`) and its pin to 0.5.0: the starter pin plan after 0.5.0 is on npm.
- Changing the jump engine (decided: keep standard skip logic).
- Fixing Payload's own form-state replacement after a save (design 15): Payload core, not the plugin.
- A per-form display time zone for emails, display patterns (`dd/MM/yyyy`), month-only dates, and a time zone picker in the admin.
- Dropping the old localized `default_value` columns from sites' `_locales` tables: kept in 0.5.0 for rollback; a later release may drop them.
- Pick-lists for the email row's `visitorField` and `replyToField` (unchanged from 0.4.0).
- Publishing: the planner pushes to `main` after review (covered by the reviewer's standing yes of 12 Nov, see SUMMARY).
