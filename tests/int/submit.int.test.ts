import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { devPluginOptions } from '../../dev/payload.config.js'
import { DEFAULT_WORDS } from '../../src/exports/shared.js'
import { type App, countDocs, createForm, field, outbox, section, startApp, submit, translateForm } from './helpers.js'

let app: App
let appIp: App
let appTs: App
let siteverify: { success: boolean }

const postcode = {
  block: { slug: 'postcode', fields: [], labels: { plural: 'Postcodes', singular: 'Postcode' } },
  validate: (value: unknown) => (/\d/.test(String(value)) ? (true as const) : 'A postcode has at least one digit.'),
}

beforeAll(async () => {
  app = await startApp({ plugin: { fields: { fileUpload: true, postcode } } })
  appIp = await startApp({ plugin: { metadata: { ip: true } } })
  appTs = await startApp({
    plugin: { rateLimit: { max: 3, windowSeconds: 600 }, turnstile: { secretKey: 'test-only-turnstile-secret' } },
  })
  siteverify = { success: true }
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
      return Promise.resolve(Response.json(siteverify))
    }
    return realFetch(input, init)
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await Promise.all([app?.payload.destroy(), appIp?.payload.destroy(), appTs?.payload.destroy()])
})

const contactSections = [
  section('s', [
    field('text', 'name', { required: true, words: { errorEmpty: 'Tell us your name.', label: 'Name' } }),
    field('email', 'email', { required: true, words: { errorInvalid: 'That email does not look right.', label: 'Email' } }),
    field('textarea', 'message', { words: { label: 'Message' } }),
  ]),
]

describe('public read', () => {
  test('public read resolves choices and words and hides delivery', async () => {
    const topic = await app.payload.create({
      collection: 'topics' as never,
      data: { slug: 'cameras', _status: 'published', closer: 'Bye.', fieldSet: 'item', label: 'Cameras', opener: 'Hi!' } as never,
      overrideAccess: true,
    })
    const form = await createForm(app, {
      delivery: {
        emails: [{ kind: 'team', label: 'Team', to: 'team@example.com' }],
        webhooks: [
          { headers: [{ key: 'X-Key', value: 'header-secret-value' }], label: 'Hook', signingSecret: 'signing-secret-value', url: 'https://hooks.example.com/in' },
        ],
        whatsapp: { enabled: true, number: '+1 555 000 1234' },
      },
      sections: [section('s', [field('radio', 'need', { optionsFrom: 'topics', sourceItems: [{ relationTo: 'topics', value: topic.id }] })])],
      wording: { back: '' },
    })
    const res = await app.fetch(`/custom-forms/public/${form.slug}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sections[0].fields[0].options).toEqual([
      { attributes: { closer: 'Bye.', fieldSet: 'item', opener: 'Hi!' }, label: 'Cameras', value: 'cameras' },
    ])
    expect(body.wording.back).toBe(DEFAULT_WORDS.back)
    expect(body.wording.send).toBe('Send now')
    expect(body.whatsapp).toEqual({ number: '+1 555 000 1234' })
    expect(body).not.toHaveProperty('delivery')
    expect(JSON.stringify(body)).not.toMatch(/team@example\.com|hooks\.example\.com|secret-value|emails|webhooks/)
  })

  test('public read of drafts and unknown slugs is 404', async () => {
    const draft = await createForm(app, { sections: contactSections }, { draft: true })
    for (const slug of [draft.slug, 'no-such-form']) {
      const res = await app.fetch(`/custom-forms/public/${slug}`)
      expect(res.status, slug).toBe(404)
      expect(await res.json()).toEqual({ message: DEFAULT_WORDS.notFound, ok: false })
    }
  })
})

describe('submit', () => {
  test('unknown or all locale reads and stores the default locale', async () => {
    const form = await createForm(app, { sections: contactSections, title: 'Contact', wording: { send: 'Send', success: 'Thanks, we got it.' } })
    await translateForm(app, form.id, 'es', (doc) => {
      doc.title = 'Contacto'
      doc.wording = { ...doc.wording, send: 'Enviar', success: 'Gracias, lo recibimos.' }
      for (const f of doc.sections[0].fields) {
        f.words = { ...f.words, label: `ES ${f.fieldKey}` }
      }
    })
    // The Spanish words are there for `es` itself.
    expect((await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { locale: 'es' })).body.message).toBe('Gracias, lo recibimos.')
    for (const locale of ['all', 'xx']) {
      const { body, status } = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { locale })
      expect(status, locale).toBe(200)
      expect(body.message, locale).toBe('Thanks, we got it.')
      const sub = (await app.payload.findByID({ id: body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
      expect(sub.metadata.locale, locale).toBe('en')
      expect(sub.snapshot.map((r: { label: string }) => r.label), locale).toEqual(['Name', 'Email'])
    }
    const res = await app.fetch(`/custom-forms/public/${form.slug}?locale=all`)
    expect(res.status).toBe(200)
    const read = await res.json()
    expect(read.title).toBe('Contact')
    for (const [key, value] of Object.entries(read.wording)) {
      expect(typeof value, key).toBe('string')
    }
    expect(read.wording.send).toBe('Send')
    expect(read.sections[0].fields[0].words.label).toBe('Name')
  })

  test('valid answers are stored and answered with success words', async () => {
    const form = await createForm(app, { sections: contactSections, wording: { success: 'Got it, thanks.' } })
    const { body, status } = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com', message: 'Hello' })
    expect(status).toBe(200)
    expect(body).toEqual({ message: 'Got it, thanks.', ok: true, submissionId: expect.anything() })
    const sub = (await app.payload.findByID({ id: body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
    expect(sub.answers).toEqual({ name: 'Ana', email: 'ana@example.com', message: 'Hello' })
    expect(sub.status).toBe('processed')
    expect(sub.snapshot.map((r: { label: string; value: string }) => `${r.label}=${r.value}`)).toEqual(['Name=Ana', 'Email=ana@example.com', 'Message=Hello'])
  })

  test('invalid answers give field errors and store nothing', async () => {
    const form = await createForm(app, {
      delivery: { emails: [{ kind: 'team', label: 'Team', to: 'team@example.com' }] },
      sections: contactSections,
    })
    const before = await countDocs(app, 'custom-form-submissions')
    outbox.length = 0
    const { body, status } = await submit(app, form.slug, { name: '', email: 'not-an-email' })
    expect(status).toBe(400)
    expect(body).toEqual({
      fieldErrors: { name: 'Tell us your name.', email: 'That email does not look right.' },
      message: DEFAULT_WORDS.errorPrefix,
      ok: false,
    })
    expect(await countDocs(app, 'custom-form-submissions')).toBe(before)
    expect(outbox).toHaveLength(0)
  })

  test('server applies show/hide and required without the renderer', async () => {
    const form = await createForm(app, {
      sections: [
        section('s', [
          field('radio', 'kind', { options: [{ label: 'Person', value: 'person' }, { label: 'Company', value: 'company' }], required: true }),
          field('text', 'company-name', { required: true, visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'equals', value: 'company' }] } }),
          field('text', 'first-name', { required: true, visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'equals', value: 'person' }] } }),
        ]),
      ],
    })
    const refused = await submit(app, form.slug, { 'company-name': 'Should be dropped', kind: 'person' })
    expect(refused.status).toBe(400)
    expect(Object.keys(refused.body.fieldErrors)).toEqual(['first-name'])
    const ok = await submit(app, form.slug, { 'company-name': 'Should be dropped', 'first-name': 'Ana', kind: 'person' })
    expect(ok.status).toBe(200)
    const sub = (await app.payload.findByID({ id: ok.body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
    expect(sub.answers).toEqual({ 'first-name': 'Ana', kind: 'person' })
  })

  test('closed form answers 409 with its words', async () => {
    const form = await createForm(app, { intakeState: 'closed', sections: contactSections, wording: { closed: 'We are on holiday.' } })
    const before = await countDocs(app, 'custom-form-submissions')
    const { body, status } = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' })
    expect(status).toBe(409)
    expect(body).toEqual({ message: 'We are on holiday.', ok: false })
    expect(await countDocs(app, 'custom-form-submissions')).toBe(before)
  })

  test('redirect success returns the URL', async () => {
    const form = await createForm(app, { sections: contactSections, successRedirectURL: '/thanks', successType: 'redirect' })
    const { body, status } = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' })
    expect(status).toBe(200)
    expect(body.redirectURL).toBe('/thanks')
  })

  test('snapshot keeps the label used at submission', async () => {
    const form = await createForm(app, { sections: contactSections })
    const { body } = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' })
    const doc = (await app.payload.findByID({ id: form.id, collection: 'custom-forms' as never, depth: 0, overrideAccess: true })) as Record<string, any>
    doc.sections[0].fields[0].words.label = 'Full name'
    await app.payload.update({ id: form.id, collection: 'custom-forms' as never, data: { sections: doc.sections } as never, overrideAccess: true })
    const sub = (await app.payload.findByID({ id: body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
    expect(sub.snapshot[0]).toMatchObject({ fieldKey: 'name', label: 'Name', sectionKey: 's', value: 'Ana' })
  })

  test('IP is stored only with metadata.ip', async () => {
    const headers = { 'cf-connecting-ip': '192.0.2.44', 'user-agent': 'forms-test-agent' }
    const plain = await createForm(app, { sections: contactSections })
    const withIp = await createForm(appIp, { sections: contactSections })
    const a = await submit(app, plain.slug, { name: 'Ana', email: 'ana@example.com' }, { headers })
    const b = await submit(appIp, withIp.slug, { name: 'Ana', email: 'ana@example.com' }, { headers })
    const subA = (await app.payload.findByID({ id: a.body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
    const subB = (await appIp.payload.findByID({ id: b.body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })) as Record<string, any>
    expect(subA.metadata.ip ?? null).toBeNull()
    expect(subA.metadata.userAgent).toBe('forms-test-agent')
    expect(subB.metadata.ip).toBe('192.0.2.44')
  })

  test('custom field type validate runs on the server', async () => {
    const form = await createForm(app, {
      sections: [section('s', [{ blockType: 'postcode', fieldKey: 'postcode', required: true, words: { label: 'Postcode' } } as never])],
    })
    const bad = await submit(app, form.slug, { postcode: 'abc' })
    expect(bad.status).toBe(400)
    expect(bad.body.fieldErrors).toEqual({ postcode: 'A postcode has at least one digit.' })
    const good = await submit(app, form.slug, { postcode: 'AB1 2CD' })
    expect(good.status).toBe(200)
  })

  test('filled honeypot stores and sends nothing', async () => {
    const form = await createForm(app, {
      delivery: { emails: [{ kind: 'team', label: 'Team', to: 'team@example.com' }] },
      sections: contactSections,
      wording: { genericError: 'Marker generic.' },
    })
    outbox.length = 0
    const before = await countDocs(app, 'custom-form-submissions')
    const { body, status } = await submit(app, form.slug, { name: 'Ana', _hp: 'http://spam.example', email: 'ana@example.com' })
    expect(status).toBe(400)
    expect(body).toEqual({ message: 'Marker generic.', ok: false })
    expect(await countDocs(app, 'custom-form-submissions')).toBe(before)
    expect(outbox).toHaveLength(0)
  })

  test('whatsapp-only forms skip turnstile and rate limit', async () => {
    const form = await createForm(appTs, {
      delivery: { store: false, whatsapp: { enabled: true, number: '+1 555 000 1234' } },
      sections: [section('s', [field('text', 'name', { required: true })])],
    })
    siteverify = { success: false }
    const headers = { 'cf-connecting-ip': '192.0.2.10' }
    for (let i = 0; i < 5; i += 1) {
      const { body, status } = await submit(appTs, form.slug, { name: `Ana ${i}` }, { headers })
      expect(status).toBe(200)
      expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/15550001234\?text=/)
      expect(body).not.toHaveProperty('submissionId')
    }
    siteverify = { success: true }
  })

  test('sixth submission in the window answers 429', async () => {
    const form = await createForm(app, { sections: contactSections, wording: { tooManyTries: 'Slow down.' } })
    const headers = { 'cf-connecting-ip': '192.0.2.77' }
    for (let i = 0; i < 5; i += 1) {
      expect((await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { headers })).status).toBe(200)
    }
    const sixth = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { headers })
    expect(sixth.status).toBe(429)
    expect(sixth.body).toEqual({ message: 'Slow down.', ok: false })
    const other = await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { headers: { 'cf-connecting-ip': '192.0.2.78' } })
    expect(other.status).toBe(200)
  })

  test('rate limit keys hold a hash, not the IP', async () => {
    const form = await createForm(app, { sections: contactSections })
    await submit(app, form.slug, { name: 'Ana', email: 'ana@example.com' }, { headers: { 'cf-connecting-ip': '203.0.113.7' } })
    const keys = await app.payload.kv.keys()
    const mine = keys.filter((k) => k.startsWith(`forms:rl:${form.id}:`))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatch(/^forms:rl:\d+:[0-9a-f]{64}$/)
    for (const key of keys) {
      expect(key).not.toContain('203.0.113.7')
      expect(JSON.stringify(await app.payload.kv.get(key))).not.toContain('203.0.113.7')
    }
  })

  test("server messages come from the form's words", async () => {
    const markers = {
      closed: 'M-closed',
      errorPrefix: 'M-prefix',
      fileRejected: 'M-file {{label}}',
      genericError: 'M-generic',
      invalid: 'M-invalid {{label}}',
      required: 'M-required {{label}}',
      securityCheckFailed: 'M-security',
      success: 'M-success',
      tooManyTries: 'M-tries',
    }
    const sections = [
      section('s', [
        field('text', 'name', { required: true, words: { label: 'Name' } }),
        field('email', 'email', { words: { label: 'Email' } }),
        field('text', 'nick', { required: true, words: { errorEmpty: 'M-field-empty', label: 'Nick' } }),
        field('email', 'backup', { words: { errorInvalid: 'M-field-invalid', label: 'Backup' } }),
      ]),
    ]
    const form = await createForm(appTs, { sections, wording: markers })
    const ip = (n: number) => ({ 'cf-connecting-ip': `192.0.2.${100 + n}` })

    // Field errors: the form's templates, then the field's own words.
    const invalid = await submit(appTs, form.slug, { backup: 'x', 'cf-turnstile-response': 'tok', email: 'x' }, { headers: ip(1) })
    expect(invalid.status).toBe(400)
    expect(invalid.body).toEqual({
      fieldErrors: { name: 'M-required Name', backup: 'M-field-invalid', email: 'M-invalid Email', nick: 'M-field-empty' },
      message: 'M-prefix',
      ok: false,
    })
    // Security check.
    siteverify = { success: false }
    const security = await submit(appTs, form.slug, { name: 'A', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(2) })
    expect(security.body).toEqual({ message: 'M-security', ok: false })
    siteverify = { success: true }
    // Generic error (honeypot).
    const generic = await submit(appTs, form.slug, { name: 'A', _hp: 'x', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(3) })
    expect(generic.body).toEqual({ message: 'M-generic', ok: false })
    // Success, then too many tries (limit 3 in this app).
    const ok = await submit(appTs, form.slug, { name: 'A', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(4) })
    expect(ok.body).toMatchObject({ message: 'M-success', ok: true })
    await submit(appTs, form.slug, { name: 'A', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(4) })
    await submit(appTs, form.slug, { name: 'A', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(4) })
    const tries = await submit(appTs, form.slug, { name: 'A', 'cf-turnstile-response': 'tok', nick: 'a' }, { headers: ip(4) })
    expect(tries).toEqual({ body: { message: 'M-tries', ok: false }, status: 429 })
    // Wrong file (file uploads on in the main app).
    const fileForm = await createForm(app, {
      sections: [section('s', [field('fileUpload', 'cv', { words: { label: 'CV' } })])],
      wording: markers,
    })
    const data = new FormData()
    data.append('cv', new File(['MZ fake'], 'tool.exe', { type: 'application/x-msdownload' }))
    const file = await app.fetch(`/custom-forms/submit/${fileForm.slug}`, { body: data, method: 'POST' })
    expect(await file.json()).toEqual({ fieldErrors: { cv: 'M-file CV' }, message: 'M-prefix', ok: false })
    // Closed.
    await appTs.payload.update({ id: form.id, collection: 'custom-forms' as never, data: { intakeState: 'closed' } as never, overrideAccess: true })
    const closed = await submit(appTs, form.slug, { name: 'A', nick: 'a' }, { headers: ip(5) })
    expect(closed).toEqual({ body: { message: 'M-closed', ok: false }, status: 409 })
    // No fixed English string anywhere.
    for (const message of [invalid, security, generic, ok, tries, closed].map((r) => r.body.message)) {
      expect(message).toMatch(/^M-/)
    }
  })
})

// Keep the dev defaults visible to readers of this file.
void devPluginOptions
