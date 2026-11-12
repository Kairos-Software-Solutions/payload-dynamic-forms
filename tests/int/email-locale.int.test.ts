import type { SendEmailOptions } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { type App, createForm, type Doc, emailControl, field, login, outbox, section, startApp, submit, translateForm } from './helpers.js'

type Call = { locale?: null | string; title: string; to: string }

let app: App
let appPlain: App
let adminToken: string
const calls: Call[] = []

const beforeEmail = (message: SendEmailOptions, ctx: { form: { title: string }; locale?: null | string }) => {
  calls.push({ locale: ctx.locale, title: ctx.form.title, to: String(message.to) })
  return message
}

beforeAll(async () => {
  app = await startApp({ plugin: { beforeEmail } })
  appPlain = await startApp({ localization: false, plugin: { beforeEmail } })
  adminToken = await login(app, 'admin')
})

beforeEach(() => {
  outbox.length = 0
  calls.length = 0
  emailControl.fail = false
})

afterAll(async () => {
  await Promise.all([app?.payload.destroy(), appPlain?.payload.destroy()])
})

const sections = [
  section('s', [
    field('text', 'name', { required: true, words: { label: 'Name' } }),
    field('email', 'email', { required: true, words: { label: 'Email' } }),
    field('checkbox', 'news', { words: { label: 'Newsletter' } }),
  ]),
]

const SPANISH_LABELS: Record<string, string> = { name: 'Nombre', email: 'Correo', news: 'Boletín' }

const team = { body: 'Form {{formTitle}}\n{{*}}', kind: 'team', label: 'Team', subject: 'New: {{formTitle}}', to: 'team@example.com' }
const visitor = { body: '{{*}}', kind: 'visitor', label: 'Copy', subject: 'Thanks, {{name}}', visitorField: 'email' }

/** A published form with English words, plus Spanish title, labels, yes word and email words. */
async function bilingualForm(target: App, spanishVisitor: (row: Doc) => void = (row) => {
  row.subject = 'Gracias, {{name}}'
  row.body = '{{*}}'
}) {
  const form = await createForm(target, { delivery: { emails: [team, visitor] }, sections, title: 'Contact', wording: { yes: 'Yes' } })
  await translateForm(target, form.id, 'es', (doc) => {
    doc.title = 'Contacto'
    doc.wording = { ...doc.wording, yes: 'Sí' }
    for (const f of doc.sections[0].fields) {
      f.words = { ...f.words, label: SPANISH_LABELS[f.fieldKey] }
    }
    for (const row of doc.delivery.emails) {
      if (row.kind === 'team') {
        // Stored, but never sent: team emails use the default language.
        row.subject = 'Nuevo: {{formTitle}}'
        row.body = 'Formulario {{formTitle}}\n{{*}}'
      } else {
        spanishVisitor(row)
      }
    }
  })
  return form
}

const answers = { name: 'Ana', email: 'ana@example.com', news: true }

function sent(to: string): SendEmailOptions {
  const message = outbox.find((m) => m.to === to)
  expect(message, to).toBeDefined()
  return message!
}

async function readSubmission(target: App, id: number | string): Promise<Doc> {
  return (await target.payload.findByID({ id, collection: 'custom-form-submissions' as never, depth: 0, overrideAccess: true }))
}

function columns(target: App, table: string): string[] | undefined {
  const t = (target.payload.db as unknown as { tables: Record<string, Record<string, unknown>> }).tables[table]
  return t ? Object.keys(t) : undefined
}

describe('emails in the reader language', () => {
  test('email subject and body live in the locales table', () => {
    const locales = columns(app, 'custom_forms_delivery_emails_locales')
    expect(locales).toBeDefined()
    expect(locales).toEqual(expect.arrayContaining(['subject', 'body']))
    const rows = columns(app, 'custom_forms_delivery_emails')
    expect(rows).toBeDefined()
    expect(rows).toEqual(expect.arrayContaining(['label', 'to']))
    expect(rows).not.toContain('subject')
    expect(rows).not.toContain('body')
  })

  test("visitor copy is written in the submission's language", async () => {
    const form = await bilingualForm(app)
    const { body, status } = await submit(app, form.slug, answers, { locale: 'es' })
    expect(status).toBe(200)
    const copy = sent('ana@example.com')
    expect(copy.subject).toBe('Gracias, Ana')
    expect(copy.text).toContain('Nombre')
    expect(copy.text).toContain('Correo')
    expect(copy.text).toContain('Boletín')
    expect(copy.text).toContain('Sí')
    expect(copy.text).not.toMatch(/Name|Newsletter|Yes/)
    expect((await readSubmission(app, body.submissionId)).metadata.locale).toBe('es')
  })

  test('team email is written in the default language', async () => {
    const form = await bilingualForm(app)
    await submit(app, form.slug, answers, { locale: 'es' })
    const mail = sent('team@example.com')
    expect(mail.subject).toBe('New: Contact')
    expect(mail.text).toContain('Form Contact')
    expect(mail.text).toContain('Name')
    expect(mail.text).toContain('Newsletter')
    expect(mail.text).toContain('Yes')
    expect(mail.text).toContain('Ana')
    expect(mail.text).toContain('ana@example.com')
    expect(mail.text).not.toMatch(/Nombre|Boletín|Sí|Contacto|Formulario/)
  })

  test('empty spanish email words fall back to the default language', async () => {
    const form = await bilingualForm(app, (row) => {
      row.subject = ''
      // Never set: no Spanish value (a missing key would get the field's default on save).
      row.body = null
    })
    // As stored in Spanish: an empty subject and no body.
    const stored = (await app.payload.findByID({
      id: form.id,
      collection: 'custom-forms',
      depth: 0,
      fallbackLocale: false,
      locale: 'es',
      overrideAccess: true,
    })) as Doc
    const row = stored.delivery.emails.find((e: Doc) => e.kind === 'visitor')
    expect(row.subject ?? '').toBe('')
    expect(row.body ?? null).toBeNull()

    await submit(app, form.slug, answers, { locale: 'es' })
    const copy = sent('ana@example.com')
    expect(copy.subject).toBe('Thanks, Ana')
    expect(copy.text).toContain('Nombre: Ana')
    expect(copy.text).toContain('Sí')
    expect(copy.text).not.toMatch(/Name|Yes/)
  })

  test('resend writes each email in the same language', async () => {
    const form = await bilingualForm(app)
    emailControl.fail = 'Mail server down'
    const { body } = await submit(app, form.slug, answers, { locale: 'es' })
    expect((await readSubmission(app, body.submissionId)).status).toBe('failed')
    expect(outbox).toHaveLength(0)
    emailControl.fail = false
    const res = await app.fetch(`/custom-form-submissions/${body.submissionId}/resend`, { method: 'POST', token: adminToken })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, resent: 2, status: 'processed' })
    expect(sent('ana@example.com').subject).toBe('Gracias, Ana')
    expect(sent('ana@example.com').text).toContain('Nombre')
    expect(sent('team@example.com').subject).toBe('New: Contact')
    expect(sent('team@example.com').text).toContain('Name')
    expect(sent('team@example.com').text).not.toContain('Nombre')
  })

  test('beforeEmail receives the locale each email was written in', async () => {
    const form = await bilingualForm(app)
    await submit(app, form.slug, answers, { locale: 'es' })
    expect(calls).toHaveLength(2)
    expect(calls.find((c) => c.to === 'ana@example.com')).toEqual({ locale: 'es', title: 'Contacto', to: 'ana@example.com' })
    expect(calls.find((c) => c.to === 'team@example.com')).toEqual({ locale: 'en', title: 'Contact', to: 'team@example.com' })
  })

  test('an app without localization sends as before', async () => {
    expect(appPlain.payload.config.localization).toBeFalsy()
    const rows = columns(appPlain, 'custom_forms_delivery_emails')
    expect(rows).toEqual(expect.arrayContaining(['subject', 'body']))
    expect(columns(appPlain, 'custom_forms_delivery_emails_locales')).toBeUndefined()

    const form = await createForm(appPlain, { delivery: { emails: [team, visitor] }, sections, title: 'Contact' })
    const { body, status } = await submit(appPlain, form.slug, answers)
    expect(status).toBe(200)
    expect(sent('team@example.com').subject).toBe('New: Contact')
    expect(sent('team@example.com').text).toContain('Form Contact')
    expect(sent('team@example.com').text).toContain('Newsletter: Yes')
    expect(sent('ana@example.com').subject).toBe('Thanks, Ana')
    expect(sent('ana@example.com').text).toContain('Name: Ana')
    expect((await readSubmission(appPlain, body.submissionId)).metadata.locale ?? null).toBeNull()
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.locale, call.to).toBeUndefined()
      expect(call.title, call.to).toBe('Contact')
    }
  })
})
