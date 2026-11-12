# payload-dynamic-forms

Forms for [Payload CMS](https://payloadcms.com) 3, installed with one plugin call.

**What it does**

- Adds three collections: **forms** (sections, field blocks, show/hide rules, steps, every visitor word, delivery settings; drafts and 20 versions), **submissions** (answers, a labelled snapshot, status, delivery log, resend) and **attachments** (private uploads).
- Checks every answer on the server with the same rule engine your renderer uses in the browser: show/hide rules, required-while-shown, the step path, email, number, date, length, listed choices and files.
- Spam checks on the server: honeypot, Cloudflare Turnstile and a soft per-visitor rate limit.
- Delivery: store or not, email through your app's Payload email adapter (`payload.sendEmail`), a WhatsApp link (nothing stored), signed webhooks with retries; optionally after the reply.
- Choices from a collection (with attributes that rules and message tokens can read) and prefill from link parameters.

**What it does not do**

- It ships **no visitor UI**: no visitor components and no styles. Each app renders its own form markup with the helpers from `payload-dynamic-forms/shared` (see [Rendering](#rendering)). Its only React code is a few admin components for the forms collection (key input, prefill lock, rule pick-lists, typed default pickers, row labels, editor hints) in `payload-dynamic-forms/client`, which the fields name by import-map path.
- It does not wrap Payload's official form builder; both can run in one app (their slugs differ).

## Install

The package is on the public npm registry; no token is needed.

```sh
npm install payload-dynamic-forms
# or
yarn add payload-dynamic-forms
# or
pnpm add payload-dynamic-forms
```

Then add the plugin to your Payload config (below), and run `payload generate:importmap` after installing or upgrading, so the admin finds the plugin's field components (`payload-dynamic-forms/client`). Payload 3 admins already have the peers `@payloadcms/ui` and `react`.

```ts
import { buildConfig } from 'payload'
import { formsPlugin } from 'payload-dynamic-forms'

export default buildConfig({
  // ...
  plugins: [
    formsPlugin({
      turnstile: { secretKey: process.env.TURNSTILE_SECRET_KEY },
    }),
  ],
})
```

## Options

Every option is optional.

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | `true` | `false` returns your config untouched (see [Switching off](#switching-off)). |
| `slugs` | `custom-forms`, `custom-form-submissions`, `custom-form-attachments` | Renames the collections; relationships and endpoints follow. |
| `formOverrides`, `submissionOverrides`, `attachmentOverrides` | – | Any collection property; `access`, `admin`, `hooks` and `upload` are merged key by key; `fields: ({ defaultFields }) => [...]`. |
| `fields` | all built-in types, `fileUpload` off | Field-type registry: `true`/`false` turns a type on or off, a partial block is deep-merged into the built-in one, `{ block, validate?, normalize?, toText? }` adds a new type that the server checks too. |
| `optionSources` | – | `{ topics: { collection: 'topics', labelField: 'label', valueField: 'slug', attributes: ['opener'] } }`: choices from a collection. |
| `words` | `DEFAULT_WORDS` | Default visitor words for new forms. |
| `attachments` | 10 MB per file, 25 MB per submission, PDF, images, text, CSV, Word | `{ collection?, maxFileSize?, maxTotalSize?, mimeTypes? }`, or `false` for no attachments. |
| `turnstile` | off | `{ enabled?, secretKey?, fieldName? }`. On without a secret refuses every submission and logs one line. The token field defaults to `cf-turnstile-response`. |
| `honeypotField` | `_hp` | Name of the honeypot field. |
| `rateLimit` | `{ max: 5, windowSeconds: 600 }` | Per form and visitor; `false` turns it off. |
| `whatsapp.number` | – | `({ req, form }) => string` for forms without their own number. |
| `delivery.schedule` | – | Runs email and webhooks after the reply (see [Delivery after the reply](#delivery-after-the-reply)). |
| `beforeEmail` | – | `(message, { form, answers, locale, req }) => message`: wrap the html in your layout, add headers. `form` and `locale` are the ones the email was written in (`locale` is undefined without localization). |
| `webhooks` | admin secrets on, signing optional | `{ signingSecret?, headers?, secretsInAdmin?, requireSignature? }`: webhook secrets and headers from your config (values or `({ form, req, webhook }) => …`), whether the admin has secret fields, and whether unsigned webhooks are refused (see [Webhook signature](#webhook-signature)). |
| `access.isAdmin` | any logged-in user | Who reads and writes webhook secrets in the admin, updates or deletes submissions and resends. Prefer secrets from your config (`webhooks.signingSecret` from an env var, with `webhooks.secretsInAdmin: false`): admin secrets are stored as plain text in your database and its backups. |
| `metadata` | `{ ip: false, userAgent: true, timeZone: true }` | What a submission keeps about the request. `metadata.timeZone` (default on) stores the visitor's IANA time zone (`_tz`) as `metadata.timeZone` and sends it in webhook bodies; with `timeZone: false` the zone is still used for that request (date checks, UTC conversion, snapshot and messages) but not stored, so webhooks carry none and a resend formats in `timezone`. |
| `timezone` | `UTC` | IANA time zone for submissions that send no usable `_tz`: `today` date limits, UTC storage of Date and time answers, and showing UTC instants without a recorded zone. An unknown zone throws when the config is built. |

### Field types

Built in: heading and help text (display only), text, email, long text, number, date, select, radio, checkbox, checkbox group and file upload. Each input has a key, required (off by default), width, its own words (label, hint, placeholder, error when empty, error when invalid, row label in messages), its type's own fields (choices, limits, upload settings), a default value with a link parameter to prefill from, and its show/hide rules last.

- **Keys** (question and section) are formatted to lower-case kebab-case as you type, and again on save.
- **Prefill lock**, like Payload's slug field: a locked question's link parameter is its key (`?<key>=`), on screen and on save; Unlock to type your own parameter or leave it empty (no prefill). New questions start locked, except a single checkbox, which starts unlocked with no parameter so a link can't pre-tick a consent box. The lock is stored in the hidden `prefillFromKey` field.
- **Defaults match the question type** (0.5.0): text and long text keep a translatable text default; email takes one address; number a number inside Min/Max (a number input); date a value in the question's mode, or Today/Now, from a picker; select and radio one of the question's own option values, checkbox group several, and choices from a collection one of the chosen items (pick-lists). Option values, numbers and dates are the same in every language. Saving refuses a default or a date limit that doesn't fit its question; an empty default is always fine. Renderers get number defaults as numbers.
- **Rows** of every list (sections, questions, rules, jumps, options, emails, webhooks, headers) start open and are labelled by their own words: sections `key · title`, questions `type · key · label`, rules in words, options `label = value`, jumps `Jump to <section>`.
- **Submissions** are records: their form, answers, snapshot, attachments, delivery log and metadata can't be edited through any API (field access); status and **Resend failed deliveries** stay editable by admins.
- **Rules** pick their field, and next-step rules (jumps) their section, from lists of the keys in the form as you edit it. A stored key the form no longer has stays visible as "(not in this form)", and saving names it.
- **Radio and select** need at least two choices: two typed options, or two picked items when the choices come from a collection (picking none, meaning every published item, is always fine). A checkbox group may have one option.
- An optional radio question shows editors a hint to add a choice such as "None of the above" or "Not sure", because visitors can't clear a radio answer.
- New forms start **Step by step**; "Single page" is still an option, and saved forms keep their mode.

### Date and time questions

A date question asks for one of three things (**Asks for**, Payload's names): **Date** (`dayOnly`, the default; questions saved before 0.5.0 are Date questions), **Date and time** (`dayAndTime`) or **Time** (`timeOnly`). Answers are checked and kept exactly as the browser's inputs send them: `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM` (no zone) and `HH:MM`. Earliest and Latest are in the same format, or "Today" (not on Time questions); a Date and time question's Today limits mean 00:00 and 23:59 of that day.

The renderer sends the visitor's IANA time zone as `_tz` (`TIME_ZONE_FIELD`, with `browserTimeZone()` from `/shared`); without a usable one the plugin's `timezone` option (default `UTC`) applies. The zone decides what "today" is for that visitor. A Date and time question can be **Stored as** "UTC instant (ISO 8601)" (`utc`): the submit endpoint stores `2026-11-12T19:30:00.000Z` for `2026-11-12T14:30` in New York. Date-only and time-only answers are never converted to UTC (converting a calendar date can move it a day).

**In emails and messages** picks a display style: as stored (the default), Short, Medium or Long, through `Intl.DateTimeFormat` in the message's language (`formatAnswerDate`). Wall-time values never shift; a UTC instant is shown in the visitor's recorded zone followed by its name, e.g. `… (America/New_York)`. Webhooks carry the stored values, plus `submission.timeZone` (or `timeZone` in answers-only bodies) when a zone was recorded.

### Jumps and show rules

In step-by-step forms a section's **Jump to section when** rules (jumps) send the visitor straight to their target: a jump skips every section in between, even ones whose show rules match, as skip logic does in Google Forms, Microsoft Forms and Qualtrics. A hint under the jumps names each skipped section that has its own show rules. For an optional section, don't jump over it: use a show rule on that section instead, and let the visitor reach it in order.

A new type:

```ts
formsPlugin({
  fields: {
    postcode: {
      block: { slug: 'postcode', fields: [] }, // key, required, words and rules are added for you
      validate: (value) => (/\d/.test(String(value)) ? true : 'A postcode has at least one digit.'),
    },
  },
})
```

### Words

Every word a visitor reads is a field: per question (label, hint, placeholder, errors, row label) and per form in **Form wording** (send, sending, sent, continue, back, choose one, step progress, optional hint, error prefix, closed, success, not found, required, invalid, file rejected, too many tries, security check failed, generic error, and the yes and no that a ticked or unticked checkbox becomes in emails, WhatsApp messages, webhooks and the snapshot). Word fields are localized when your app has localization. `getPublicForm` fills empty words from the defaults.

An email output's subject and body are localized too. A visitor copy is written in the submission's language: its subject, body, row and choice labels, yes and no and form title come from the form read in that language. A team email is written in your app's default language, so the team reads one language whatever the visitor used (its other-language subject and body are stored but not sent). An empty translation uses the default language's words through Payload's fallback. Resends keep each email's language. The WhatsApp message, webhooks and the stored snapshot stay in the submission's language.

### Tokens

Email subjects and bodies and WhatsApp templates take `{{key}}` (dashes and underscores allowed), `{{key.attribute}}` (an attribute of the chosen option), `{{formTitle}}`, `{{submissionId}}`, `{{*}}` (one `Label: value` line per answered, shown field) and `{{*:table}}` (the same rows as an HTML table). Unknown tokens become empty; values are HTML-escaped in html and line breaks are removed from subjects. Email addresses (`to`, `cc`, `bcc`, `from`) can't hold tokens: to write to the visitor, add a **visitor copy** naming an email field.

## Attachments and storage order

Attachments are a normal Payload upload collection with no public read: only logged-in users read them, and only the submit endpoint creates them. To keep the files in R2 (or S3, …), map the collection in your storage plugin and list the storage plugin **after** `formsPlugin`, so the collection exists when the storage plugin runs:

```ts
plugins: [
  formsPlugin({ fields: { fileUpload: true } }),
  r2Storage({ bucket: env.R2, collections: { 'custom-form-attachments': true } }),
]
```

To use an upload collection of your own instead, pass `attachments: { collection: 'private-files' }`: the plugin adds its link fields (form, submission, field key and label) to it and refuses to start if it is not an upload collection. File uploads need a form that stores submissions.

## Migrations

The plugin adds collections, so apps on Postgres or SQLite/D1 with migrations run `payload migrate:create` after installing it (and after changing `slugs`, `fields` or `optionSources`), then `payload migrate`. Default slugs differ from the official form builder's `forms` and `form-submissions`, so both can run while you move over.

Setting `webhooks.secretsInAdmin: false` also changes the schema: see [Secrets from your config](#secrets-from-your-config).

**0.3.0.** With localization, the `subject` and `body` of the email rows move to the `_locales` table (`custom_forms_delivery_emails_locales`, and the same in the versions tables, `_custom_forms_v_version_delivery_emails_locales`). Payload's generated migration changes the schema only: in that migration, copy each row's old subject and body values into the default locale's rows, or enter them again. Without localization nothing changes.

**0.4.0.** One schema change and a new import map:

- Every input block table of the forms collection (built-in and your own types) and its `_v` versions table gets a nullable boolean column `prefill_from_key` (no default, so existing rows stay `NULL`), and the forms table's `presentation_mode` default changes from `singlePage` to `steps`. Nothing is renamed or moved.
- **Postgres:** run the generated migration (`payload migrate:create`, read it, `payload migrate`).
- **SQLite and D1: don't run the generated migration.** drizzle-kit turns the default change into a rebuild of the forms table (copy, `DROP TABLE`, rename); D1 ignores its `PRAGMA foreign_keys=OFF`, so the drop deletes the child rows: sections, questions and delivery rows. Run `payload migrate:create`, keep the generated snapshot JSON, and replace the migration's SQL with only `ALTER TABLE <table> ADD COLUMN prefill_from_key integer` for every input block table and every matching `_v` table (the names are in the generated SQL). Leave the old `presentation_mode` default: new forms still start step by step, because Payload writes the value on create.
- Run `payload generate:importmap` after upgrading, or the forms admin shows missing-component errors for the key, prefill and rule fields.
- Questions saved with 0.3.0 keep their prefill parameter: an empty one still prefills nothing, a typed one keeps working. They show unlocked; click Lock to make one follow its key. Saved forms keep their presentation mode. A radio or select with one choice keeps working for visitors, but its form's next save is refused until a choice is added.
- An update that resends `sections` without their row ids (a seed, a script) resets every question's lock to its default (locked) and so overwrites a custom prefill parameter with the key. Send the row ids, or `prefillFromKey` and `prefillParam` explicitly.
- Rollback: pin 0.3.0 and run `payload generate:importmap` again (the 0.4.0 map imports `payload-dynamic-forms/client`). 0.3.0 ignores the new column; parameters written by locked saves keep prefilling as plain parameters.

**0.5.0.** New nullable columns, a copy of the old defaults, a backfill and a new import map. No existing column changes type, default or not-null; nothing is renamed.

- **Columns added** (no default), in each table and its `_v` twin: `default_value` (text) in the email, number, date, select and radio block tables (apps with localization; without it the column exists already); `mode`, `value_format` and `display_style` in the date block table; `send_another` in the forms table; `wording_send_another` in the forms `_locales` table; `metadata_time_zone` in the submissions table.
- **The copy.** With localization, the 0.4.0 default of those five types lives in `<block>_locales.default_value`, per language, and 0.5.0 reads the block table's new `default_value`. In the migration's `up()`, read each question's old defaults (and its option values, Min/Max and source), call `carryOverDefault` from `payload-dynamic-forms` and write the value it returns. It carries the default-language value only when it fits the 0.5.0 rules; defaults that don't fit are reported, not carried: print the report and keep it in `forms-0.5.0-carry-over.txt`. The old `_locales` column stays, but every 0.5.0 save of a form clears its old `_locales` default.
- **The backfill.** Payload fills a default only for missing values, not `NULL`, so `up()` also writes the defaults into existing rows: `mode = 'dayOnly'`, `value_format = 'local'`, `display_style = 'asStored'` on date rows, `send_another = 0` (`false` on Postgres) on forms, and the Send another words per locale in `wording_send_another` (the plugin's `words.sendAnother`, or each language's own words). Same in the `_v` tables.
- **SQLite and D1: hand-write the migration.** A generated one can rebuild tables, and on D1 a rebuild deletes the child rows. Run `payload migrate:create`, keep its snapshot JSON, and replace its SQL with `ALTER TABLE <table> ADD COLUMN <column> <type>` for the columns above, then the copy and the backfill.
- **Postgres:** the generated migration adds the columns and drops `default_value` from the `_locales` tables. Edit it so the copy, the report file and the backfill run after the `ADD COLUMN` statements and before that `DROP COLUMN` (or delete the drops).
- Run `payload generate:importmap` after upgrading (new admin components).
- Old forms whose checkbox-group default, text default or a date limit doesn't fit their question can't be saved until fixed; visitors are unaffected (a default that doesn't fit starts empty).
- **Rollback:** run the migration's `down()` before re-pinning 0.4.0: a 0.5.0 save clears the old `_locales` default, so a re-pin alone loses the defaults. In `down()`, call `rollbackDefault` per question and write its value back into the default-language `_locales.default_value` row and its Earliest and Latest into the date row (it drops `today`, times and date-times, which 0.4.0 can't read, and reports them: keep the report in `forms-0.5.0-rollback.txt`), then drop the added columns. Then pin 0.4.0 and run `payload generate:importmap` again. Answers stored as UTC instants stay as stored.

## Switching off

`formsPlugin({ enabled: false })` returns your config unchanged: no collections, fields, endpoints or hooks. A starter can carry the call switched off.

**Warning:** switching it off on an app that already has forms or submissions drops those tables at the next migration you create. Export what you need first.

## Rendering

The package has no UI. Read a published form with `getPublicForm(payload, slug, { locale })` on the server, or `GET /api/custom-forms/public/:slug`, and render it with the shared helpers: `initialAnswers` (defaults and link-parameter prefill), `getVisibility` (what is shown, and in step-by-step forms the path), `getStepPath`, `getNextSectionKey`, `getStepProgress`, `checkAnswers` (the same checks the server runs) and the form's words. To place a form on any page, add `formBlock()` to your page blocks; it holds one relationship to a form.

A minimal client component (`examples/minimal-form.tsx`, typechecked in this repo):

```tsx
'use client'

import {
  type Answers,
  checkAnswers,
  type FieldBlock,
  getFieldKey,
  getOptions,
  getVisibility,
  initialAnswers,
  type InputBlock,
  isInputBlock,
  type PublicForm,
  type SubmitResult,
} from 'payload-dynamic-forms/shared'
import { type FormEvent, useState } from 'react'

type Props = {
  /** From `getPublicForm(payload, slug)` or `GET /api/custom-forms/public/:slug`. */
  form: PublicForm
  /** The page's search parameters, for prefilled answers (`?need=cameras`). */
  searchParams?: string
}

/** A minimal single-page renderer: every word comes from the form. */
export function MinimalForm({ form, searchParams }: Props) {
  const words = form.wording
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(form, searchParams))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const shown = getVisibility(form, answers)

  const set = (key: string, value: Answers[string]) => setAnswers((current) => ({ ...current, [key]: value }))

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Open the WhatsApp window now, inside the click: after an await, browsers block popups.
    const popup = form.whatsapp ? window.open('', '_blank') : null
    const local = checkAnswers(form, answers, { words })
    if (!local.ok) {
      popup?.close()
      setErrors(local.fieldErrors)
      setMessage(words.errorPrefix)
      return
    }
    setSending(true)
    const response = await fetch(`/api/custom-forms/submit/${form.slug}`, {
      body: JSON.stringify({ ...answers, [form.honeypotField]: '' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = (await response.json()) as SubmitResult
    setSending(false)
    if (!result.ok) {
      popup?.close()
      setErrors(result.fieldErrors || {})
      setMessage(result.message)
      return
    }
    if (result.whatsappUrl && popup) {
      popup.location.href = result.whatsappUrl
    }
    if (result.redirectURL) {
      window.location.assign(result.redirectURL)
      return
    }
    setErrors({})
    setMessage(result.message)
  }

  function renderInput(field: InputBlock, key: string) {
    const label = field.words?.label || key
    const value = answers[key]
    const common = { id: key, name: key, required: Boolean(field.required) }
    switch (field.blockType) {
      case 'checkbox':
        return (
          <label htmlFor={key}>
            <input {...common} checked={value === true} onChange={(e) => set(key, e.target.checked)} type="checkbox" />
            {label}
          </label>
        )
      case 'checkboxGroup':
      case 'radio':
        return (
          <fieldset>
            <legend>{label}</legend>
            {getOptions(field).map((option) => {
              const list = Array.isArray(value) ? value : []
              const checked = field.blockType === 'radio' ? value === option.value : list.includes(String(option.value))
              return (
                <label key={option.value}>
                  <input
                    checked={checked}
                    name={key}
                    onChange={(e) =>
                      field.blockType === 'radio'
                        ? set(key, String(option.value))
                        : set(key, e.target.checked ? [...list, String(option.value)] : list.filter((v) => v !== option.value))
                    }
                    type={field.blockType === 'radio' ? 'radio' : 'checkbox'}
                    value={String(option.value)}
                  />
                  {option.label}
                </label>
              )
            })}
          </fieldset>
        )
      case 'select':
        return (
          <label htmlFor={key}>
            {label}
            <select {...common} onChange={(e) => set(key, e.target.value)} value={String(value ?? '')}>
              <option value="">{words.chooseOne}</option>
              {getOptions(field).map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )
      case 'textarea':
        return (
          <label htmlFor={key}>
            {label}
            <textarea {...common} onChange={(e) => set(key, e.target.value)} placeholder={field.words?.placeholder || undefined} value={String(value ?? '')} />
          </label>
        )
      default:
        return (
          <label htmlFor={key}>
            {label} {field.required ? null : words.optionalHint}
            <input
              {...common}
              onChange={(e) => set(key, e.target.value)}
              placeholder={field.words?.placeholder || undefined}
              type={['date', 'email', 'number'].includes(field.blockType) ? field.blockType : 'text'}
              value={String(value ?? '')}
            />
          </label>
        )
    }
  }

  function renderField(field: FieldBlock, index: number) {
    if (!isInputBlock(field)) {
      return field.blockType === 'heading' ? <h3 key={index}>{field.heading}</h3> : <p key={index}>{field.body}</p>
    }
    const key = getFieldKey(field)
    if (!shown.fieldKeys.has(key)) {
      return null
    }
    return (
      <div key={key}>
        {renderInput(field, key)}
        {field.words?.hint ? <small>{field.words.hint}</small> : null}
        {errors[key] ? <strong role="alert">{errors[key]}</strong> : null}
      </div>
    )
  }

  if (form.intakeState === 'closed') {
    return <p>{words.closed}</p>
  }
  return (
    <form noValidate onSubmit={onSubmit}>
      {form.sections
        .filter((section) => shown.sectionKeys.includes(String(section.key)))
        .map((section) => (
          <section key={String(section.key)}>
            {section.title ? <h2>{section.title}</h2> : null}
            {(section.fields || []).map(renderField)}
          </section>
        ))}
      <input aria-hidden autoComplete="off" hidden name={form.honeypotField} tabIndex={-1} />
      {message ? <p role="status">{message}</p> : null}
      <button disabled={sending} type="submit">
        {sending ? words.sending : words.send}
      </button>
    </form>
  )
}
```

**Time zone and Today.** Add the visitor's zone to the submit body as `[TIME_ZONE_FIELD]: browserTimeZone()` (`_tz`) so date limits and UTC storage use the visitor's clock. Call `initialAnswers` in the browser (as the example does in `useState`), so a "Today" default resolves to the visitor's day; `resolveDateLimit(field, 'min' | 'max')` gives an input's `min`/`max` for Today limits. Date questions carry `mode`, `valueFormat` and `displayStyle`: render a `date`, `datetime-local` or `time` input.

### Send another

A form whose success type is "Show the success words" can tick **Show a 'Send another' button**; the public form then has `sendAnother: true` and the button's words in `wording.sendAnother` ("Send another"). On click, the renderer resets the answers with `initialAnswers(form, searchParams)` and goes back to step 1, without a reload. Turnstile tokens are single use: a renderer using Turnstile needs a fresh token for the next send (reset the widget).

For file uploads, post `multipart/form-data` instead of JSON (one entry per file under the field key). For Turnstile, render the widget inside the form; its token goes in the `cf-turnstile-response` field.

**Draft previews.** In draft mode, pass the logged-in user and `draft: true`:

```ts
const { user } = await payload.auth({ headers: await headers() })
const form = await getPublicForm(payload, slug, { draft: true, locale, user })
```

It returns the form's newest draft when that user's own read of the forms collection returns it, with option-source items read as drafts too; anyone else (no user, or one the read access refuses) gets the published form, never an error. `GET /api/custom-forms/public/:slug?draft=true` does the same for the request's logged-in user and answers with `Cache-Control: private, no-store`. Submitting always uses the published form, so a draft is never stored or sent.

## WhatsApp

A form with WhatsApp delivery builds `https://wa.me/<digits>?text=<message>` from a template (default `{{*}}`) and a row template (default `*{{label}}:* {{value}}`, using each field's row label). The number comes from the form, else from the `whatsapp.number` option. The submit endpoint returns the link as `whatsappUrl`; `buildWhatsAppMessage` and `whatsappUrl` in `/shared` give the same link in the browser.

**Popup note:** browsers block `window.open` after an `await`. Open the window inside the click handler before posting (as the example does), then set its location when the link arrives, or close it on an error.

A form that stores nothing and only builds a WhatsApp link skips the honeypot, Turnstile and rate limit: nothing is written or sent by the server.

## Delivery after the reply

By default email and webhooks run before the endpoint answers. To answer first, pass a scheduler:

```ts
import { after } from 'next/server'

formsPlugin({ delivery: { schedule: (task) => after(task) } })
// or on Cloudflare Workers: schedule: (task) => getCloudflareContext().ctx.waitUntil(task())
```

The submission is always stored before the reply (status `received`); the task sends and sets the status. Workers keep `waitUntil` work for up to 30 s after the response: keep webhook timeouts short there (8 s with 3 retries can pass 30 s).

## Endpoints

| Endpoint | Who | Answer |
| --- | --- | --- |
| `GET /api/<forms>/public/:slug` | anyone | The published form, ready to render, or 404 `{ ok: false, message }`. With `?draft=true`, logged-in users with read access get the newest draft (`Cache-Control: private, no-store`). |
| `POST /api/<forms>/submit/:slug` | anyone | JSON or `multipart/form-data` keyed by field key, plus the honeypot and Turnstile fields. |
| `POST /api/<submissions>/:id/resend` | admins | Runs failed email and webhook deliveries again: `{ ok, status, resent, deliveryLog }`; 403 for others. |

Submit answers:

- `200 { ok: true, message, redirectURL?, submissionId?, whatsappUrl? }`
- `400 { ok: false, message, fieldErrors? }`: field errors keyed by field key, honeypot, Turnstile.
- `404` unknown or unpublished form, `409` closed form, `429` too many tries, `500` storing failed or no WhatsApp number.

Every message comes from the form's words. Logged-in admins can also resend by ticking **Resend failed deliveries** on a submission and saving.

### Delivery log and status

Each email or webhook try of a stored submission adds a log entry (kind, output, target, result, error, tries, time). The status is `processed` when all succeeded (or there was nothing to send), `partlyFailed` when some failed and `failed` when all failed. A failed email or webhook never loses the submission.

## Webhook signature

Webhooks send JSON (full: form, submission id, snapshot, attachments and answers; or answers only) by POST, PUT or PATCH with their headers, a timeout (default 8 s) and up to 3 retries (pauses 0.5 s, 1 s, 2 s).

### Secrets from your config

A webhook's signing secret and secret headers can come from two places: the admin-only fields on each webhook row, or the plugin config. Keep them in env vars when you can:

```ts
formsPlugin({
  webhooks: {
    // A string, or a function of { form, req, webhook: { id, label, url } } (may be async).
    signingSecret: ({ webhook }) => (webhook.label === 'CRM' ? process.env.CRM_WEBHOOK_SECRET : process.env.FORMS_WEBHOOK_SECRET),
    headers: { 'X-Api-Key': process.env.CRM_API_KEY! },
    secretsInAdmin: false,
    requireSignature: true,
  },
})
```

- **Which secret wins:** the webhook's own admin `signingSecret`, when it is not empty, wins over `webhooks.signingSecret`; the config secret is the fallback. An empty string or `undefined` from either means no secret. So an old admin secret left on a form keeps signing even after you set a config one: clear it, or turn the fields off.
- **Header order:** `Content-Type: application/json`, then `webhooks.headers`, then the webhook's admin secret headers, then the signature headers. A later header replaces an earlier one of the same name (any case), so admin headers override config ones and nothing overrides `X-Form-Signature` or the `webhook-*` headers.
- **`secretsInAdmin: false`** leaves the signing secret and secret header fields out of the forms collection (not hidden: gone), so no secret is stored in your database. This changes the schema: your next migration drops the signing-secret column and the webhook headers table, and **any secrets stored there are lost**. Move them to your config first.

### Checking `X-Form-Signature`

A signed webhook carries `X-Form-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, keyed by the whole secret string, as in 0.1.0. Check it on the receiving side:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyFormSignature(header: string, rawBody: string, secret: string, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return expected.length === parts.v1?.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}
```

### Standard Webhooks

Webhooks also carry the [Standard Webhooks](https://www.standardwebhooks.com/) headers next to `X-Form-Signature`, so receivers can use a ready-made verifier:

- `webhook-id` on every webhook, signed or not: `msg_<submissionId>_<outputId>` for a stored submission, else `msg_` plus a random id. It is the same on every retry and on every resend of a stored submission, so use it as an idempotency key to skip a delivery you already handled.
- `webhook-timestamp` (unix seconds, the same `t` as in `X-Form-Signature`) and `webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>">` on signed webhooks.

The HMAC key is the decoded bytes of a `whsec_` secret, or the secret's UTF-8 bytes otherwise. To verify with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library, use a `whsec_` secret (`'whsec_' + base64 of 32 random bytes`):

```sh
node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64'))"
```

```ts
import { Webhook } from 'standardwebhooks'

// Throws when the signature or timestamp doesn't check out; returns the parsed body.
const payload = new Webhook(process.env.FORMS_WEBHOOK_SECRET!).verify(rawBody, {
  'webhook-id': request.headers.get('webhook-id')!,
  'webhook-timestamp': request.headers.get('webhook-timestamp')!,
  'webhook-signature': request.headers.get('webhook-signature')!,
})
```

### Unsigned webhooks

A webhook with no secret from either place is sent unsigned, and the server logs one warning per webhook per process: `payload-dynamic-forms: webhook "<label>" on form "<slug>" is sent unsigned; set a signing secret.` With `webhooks.requireSignature: true` it isn't sent at all: its delivery log entry is `failed` with 0 tries and the error `Webhook not sent: no signing secret.`, and the status and resend follow the usual rules.

New in 0.2.0: receivers see the `webhook-*` headers (and `webhook-id` on unsigned webhooks too). A receiver that refuses unknown headers needs to allow them.

## CSV export

Use Payload's import-export plugin for the submissions collection (no jobs runner needed in sync mode):

```ts
importExportPlugin({ collections: ['custom-form-submissions'], disableJobsQueue: true })
```

## Privacy and the rate limit

Visitor IPs are not stored unless `metadata: { ip: true }`. The rate limit keeps one entry per visitor and form in Payload's KV store (`payload.kv`), keyed by a SHA-256 hash of the IP and your Payload secret, never the raw IP. It is a soft limit (read, then write); Turnstile is the main spam guard.

## Compatibility

- Use 0.3.0 or later: 0.1.0 and 0.2.0 were published with entry points at files the package doesn't contain, so they can't be imported.
- Payload `^3.92.1` (tested against 3.93.0 and React 19.3, with Next.js 16.4 in the dev app; the published 0.5.0 was tested against 3.92.1 and React 19.2). Payload 4 is not supported yet.
- The runtime code uses Web APIs only (Web Crypto, `fetch`, `node:buffer` for uploads), so it runs on Node and on Cloudflare Workers; the `/shared` entry imports nothing from Payload, React or Node and runs in the browser. React and `@payloadcms/ui` are used only by the `/client` entry (admin components, `'use client'`).
- Tested on SQLite (`@payloadcms/db-sqlite`). Postgres and Workers/D1 are not tested here; nested selects carry short `dbName`s for Postgres.

## Development

Scaffolded from Payload's plugin template: `create-payload-app` 3.93.0 `--template plugin`, which downloaded `templates/plugin` from the `3.x` branch at commit `6eb8e57198678f2e669b906097f670ec98b17523` (7 Nov 2026). Converted to Yarn 4 and SQLite; the sample code, admin components and Playwright tests were removed.

```sh
corepack enable
yarn install
yarn lint && yarn typecheck && yarn test && yarn build
yarn build && yarn check:packed   # packs, installs the tarball outside the repo, imports the main and shared entries, resolves the client entry (needs the npm registry)
yarn generate:importmap   # after changing admin components: rewrites the dev app's import map
yarn spec:validate   # OpenSpec plans in openspec/
yarn dev             # the dev app in dev/ (copy dev/.env.example to dev/.env)
```

`yarn test` runs the unit tests and the integration tests, which boot the dev app (`dev/payload.config.ts`) on a temporary SQLite file with a recording email adapter. Outbound requests are refused in tests.

**Releasing.** Bump `version` in `package.json` on `main` (straight or through a pull request). `.github/workflows/release.yml` then runs every check, including the packed install check (`yarn check:packed`) before publishing, publishes the new version to npm with provenance and tags it `v<version>`; a version whose tag already exists is skipped, so other pushes to `main` publish nothing. The first publish needs the `NPM_TOKEN` repository secret, because npm can only trust a package that already exists; after it, add this repo's `release.yml` as the trusted publisher on npmjs.com and delete the secret, and later releases use trusted publishing.

## Changelog

- 0.5.0: field standards. Defaults match the question type (email, number, date, choice pick-lists; not translated) and are checked on save; date questions ask for a date, a date and time, or a time, with Today/Now, the visitor's time zone (`_tz`, new `timezone` and `metadata.timeZone` options), optional UTC storage and display styles in messages; submission records are read-only; jumps labelled "Jump to section when" with a hint when they skip a section that has show rules; every list starts open, with row labels; an opt-in "Send another" button. New `carryOverDefault` and `rollbackDefault` for the migration. Migration and `payload generate:importmap` needed (see [Migrations](#migrations)).
- 0.4.0: admin field conventions. Rules last in each question, labelled "Rules", "Field" and "Next section"; checkboxes level with the inputs beside them; keys formatted as you type; prefill lock like the slug field (new questions prefill by their key, single checkboxes start unlocked); pick-lists for rule keys and next sections; radio and select need two choices; new forms start step by step; a hint under optional radio questions. New `payload-dynamic-forms/client` entry with the admin components and the peers `@payloadcms/ui` and `react`. Migration and `payload generate:importmap` needed (see [Migrations](#migrations)).
- 0.3.0: importable package (entry points in `dist/`), email subject and body per language (visitor copy in the visitor's language, team email in the default language), draft read for previews. Migration needed with localization (see [Migrations](#migrations)).

## Licence

MIT, see [LICENSE](LICENSE).