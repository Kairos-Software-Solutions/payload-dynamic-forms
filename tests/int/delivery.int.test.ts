import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { runDeliveries } from '../../src/delivery/run.js'
import { getPublicForm, loadPublishedForm } from '../../src/index.js'
import { buildWhatsAppMessage, whatsappUrl } from '../../src/exports/shared.js'
import { getPluginOptions } from '../../src/server/forms.js'
import {
  type App,
  countDocs,
  createForm,
  emailControl,
  field,
  login,
  outbox,
  section,
  startApp,
  submit,
} from './helpers.js'

let app: App
let appHooks: App
let appSched: App
let adminToken: string
let editorToken: string
const scheduled: Array<() => Promise<void>> = []
const hookCalls: string[] = []
let hookStatus = 200

beforeAll(async () => {
  app = await startApp()
  appHooks = await startApp({
    plugin: {
      beforeEmail: (message) => ({ ...message, html: `<div class="layout">${String(message.html)}</div>` }),
      whatsapp: { number: () => '+1 555 000 1234' },
    },
  })
  appSched = await startApp({ plugin: { delivery: { schedule: (task) => void scheduled.push(task) } } })
  adminToken = await login(app, 'admin')
  editorToken = await login(app, 'editor')
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://hooks.example.com/')) {
      hookCalls.push(url)
      return Promise.resolve(new Response(null, { status: hookStatus }))
    }
    return realFetch(input, init)
  })
})

beforeEach(() => {
  outbox.length = 0
  hookCalls.length = 0
  hookStatus = 200
  emailControl.fail = false
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await Promise.all([app?.payload.destroy(), appHooks?.payload.destroy(), appSched?.payload.destroy()])
})

type Doc = Record<string, any>

const contact = [
  section('s', [
    field('text', 'name', { required: true, words: { label: 'Name' } }),
    field('email', 'email', { required: true, words: { label: 'Email' } }),
    field('select', 'project-type', { options: [{ label: 'Website', value: 'web' }, { label: 'Print', value: 'print' }], words: { label: 'Project type' } }),
  ]),
]

const team = { body: '{{*}}', kind: 'team', label: 'Team', subject: 'New {{project-type}}', to: 'team@example.com' }

async function readSubmission(target: App, id: number | string): Promise<Doc> {
  return (await target.payload.findByID({ id, collection: 'custom-form-submissions' as never, depth: 0, overrideAccess: true })) as Doc
}

async function topicSetup(target: App, whatsapp: Record<string, unknown>) {
  const topics = []
  for (const [label, fieldSet] of [['Cameras', 'item'], ['Lens cleaning', 'service']] as const) {
    topics.push(
      await target.payload.create({
        collection: 'topics' as never,
        data: {
          _status: 'published',
          closer: `Thanks for asking about ${label.toLowerCase()}.`,
          fieldSet,
          label,
          opener: `Hello! A question about ${label.toLowerCase()}.`,
          slug: `${label.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
        } as never,
        overrideAccess: true,
      }),
    )
  }
  const form = await createForm(target, {
    delivery: { store: false, whatsapp: { enabled: true, messageTemplate: '{{need.opener}}\n\n{{*}}\n\n{{need.closer}}', ...whatsapp } },
    sections: [
      section('start', [
        field('text', 'name', { required: true, words: { label: 'Your name', rowLabel: 'Name' } }),
        field('radio', 'need', { optionsFrom: 'topics', prefillParam: 'need', required: true, words: { label: 'Topic', rowLabel: 'Topic' } }),
      ]),
      section('item-set', [field('text', 'item', { required: true, words: { label: 'Which model?', rowLabel: 'Model' } }), field('text', 'link', { words: { label: 'Link' } })], {
        visibilityRules: { rows: [{ fieldKey: 'need.fieldSet', operator: 'equals', value: 'item' }] },
      }),
      section('service-set', [field('text', 'job', { required: true, words: { label: 'What needs doing?', rowLabel: 'Job' } })], {
        visibilityRules: { rows: [{ fieldKey: 'need.fieldSet', operator: 'equals', value: 'service' }] },
      }),
    ],
  })
  return { form, topics: topics as Array<{ id: number; slug: string }> }
}

describe('delivery', () => {
  test('store off sends but writes no records', async () => {
    const form = await createForm(app, { delivery: { emails: [team], store: false }, sections: contact })
    const subsBefore = await countDocs(app, 'custom-form-submissions')
    const { body, status } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana', 'project-type': 'web' })
    expect(status).toBe(200)
    expect(body).not.toHaveProperty('submissionId')
    expect(outbox).toHaveLength(1)
    expect(await countDocs(app, 'custom-form-submissions')).toBe(subsBefore)
    expect(await countDocs(app, 'custom-form-attachments')).toBe(0)
  })

  test('team email is sent through payload.sendEmail', async () => {
    const form = await createForm(app, { delivery: { emails: [team] }, sections: contact })
    const send = vi.spyOn(app.payload, 'sendEmail')
    await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana', 'project-type': 'web' })
    expect(send).toHaveBeenCalledTimes(1)
    send.mockRestore()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ subject: 'New Website', to: 'team@example.com' })
    expect(outbox[0]!.text).toBe('Name: Ana\nEmail: ana@example.com\nProject type: Website')
  })

  test('visitor copy sends only to one valid address', async () => {
    const form = await createForm(app, {
      delivery: { emails: [{ body: 'Thanks {{name}}', kind: 'visitor', label: 'Copy', subject: 'Your message', visitorField: 'email' }] },
      sections: contact,
    })
    const ok = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    expect(ok.status).toBe(200)
    expect(outbox.map((m) => m.to)).toEqual(['ana@example.com'])
    outbox.length = 0

    // Bypassing the field checks: the delivery itself refuses a list of addresses.
    const loaded = (await loadPublishedForm(app.payload, form.slug))!
    const entries = await runDeliveries({
      answers: { email: 'a@b.com, c@d.com', name: 'Ana' },
      delivery: loaded.delivery,
      form: loaded.form,
      options: getPluginOptions(app.payload),
      payload: app.payload,
      req: {} as never,
      snapshot: [],
    })
    expect(outbox).toHaveLength(0)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'email', label: 'Copy', result: 'failed' })
    expect(entries[0]!.error).toContain('a@b.com, c@d.com')
  })

  test('beforeEmail changes the message', async () => {
    const form = await createForm(appHooks, { delivery: { emails: [{ ...team, body: '{{*:table}}' }] }, sections: contact })
    await submit(appHooks, form.slug, { email: 'ana@example.com', name: 'Ana' })
    expect(outbox).toHaveLength(1)
    expect(String(outbox[0]!.html)).toMatch(/^<div class="layout"><table>/)
  })

  test('failed email keeps the submission and logs the error', async () => {
    const form = await createForm(app, { delivery: { emails: [team] }, sections: contact, wording: { success: 'Thanks!' } })
    emailControl.fail = 'Mail server unavailable'
    const { body, status } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    expect(status).toBe(200)
    expect(body.message).toBe('Thanks!')
    const sub = await readSubmission(app, body.submissionId)
    expect(sub.status).toBe('failed')
    expect(sub.deliveryLog).toHaveLength(1)
    expect(sub.deliveryLog[0]).toMatchObject({ error: 'Mail server unavailable', kind: 'email', label: 'Team', result: 'failed' })
  })

  test('whatsapp endpoint url matches the helper and stores nothing', async () => {
    const { form, topics } = await topicSetup(app, { number: '+1 (555) 000-1234' })
    const answers = { item: 'X100', link: '', name: 'Ana', need: topics[0]!.slug }
    const keysBefore = (await app.payload.kv.keys()).length
    const subsBefore = await countDocs(app, 'custom-form-submissions')
    const filesBefore = await countDocs(app, 'custom-form-attachments')
    const { body, status } = await submit(app, form.slug, { ...answers, job: 'left over' })
    expect(status).toBe(200)
    const pub = (await getPublicForm(app.payload, form.slug))!
    const expected = whatsappUrl(
      pub.whatsapp!.number,
      buildWhatsAppMessage(pub, answers, { template: '{{need.opener}}\n\n{{*}}\n\n{{need.closer}}' }),
    )
    expect(body.whatsappUrl).toBe(expected)
    expect(decodeURIComponent(body.whatsappUrl.split('?text=')[1])).toBe(
      'Hello! A question about cameras.\n\n*Name:* Ana\n*Topic:* Cameras\n*Model:* X100\n\nThanks for asking about cameras.',
    )
    expect(body).not.toHaveProperty('submissionId')
    expect(await countDocs(app, 'custom-form-submissions')).toBe(subsBefore)
    expect(await countDocs(app, 'custom-form-attachments')).toBe(filesBefore)
    expect((await app.payload.kv.keys()).filter((k) => k.includes(`:${form.id}:`))).toEqual([])
    expect((await app.payload.kv.keys()).length).toBe(keysBefore)
  })

  test('whatsapp number falls back to the resolver', async () => {
    const { form, topics } = await topicSetup(appHooks, { number: '' })
    const { body } = await submit(appHooks, form.slug, { job: 'Clean it', name: 'Ana', need: topics[1]!.slug })
    expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/15550001234\?text=Hello!%20A%20question%20about%20lens%20cleaning/)

    // No number on the form and no resolver: generic words and one log line.
    const none = await topicSetup(app, { number: '' })
    const error = vi.spyOn(app.payload.logger, 'error')
    const res = await submit(app, none.form.slug, { item: 'X', name: 'Ana', need: none.topics[0]!.slug })
    expect(res).toEqual({ body: { message: 'Something went wrong. Please try again.', ok: false }, status: 500 })
    expect(error.mock.calls.filter((c) => JSON.stringify(c).includes('WhatsApp'))).toHaveLength(1)
    error.mockRestore()
  })

  test('scheduled delivery runs after the response', async () => {
    const form = await createForm(appSched, { delivery: { emails: [team] }, sections: contact })
    scheduled.length = 0
    const { body, status } = await submit(appSched, form.slug, { email: 'ana@example.com', name: 'Ana' })
    expect(status).toBe(200)
    expect(outbox).toHaveLength(0)
    expect((await readSubmission(appSched, body.submissionId)).status).toBe('received')
    expect(scheduled).toHaveLength(1)
    await scheduled[0]!()
    expect(outbox).toHaveLength(1)
    const sub = await readSubmission(appSched, body.submissionId)
    expect(sub.status).toBe('processed')
    expect(sub.deliveryLog.map((e: Doc) => e.result)).toEqual(['success'])
  })

  const withHook = {
    emails: [team],
    webhooks: [{ label: 'CRM', url: 'https://hooks.example.com/crm' }],
  }

  test('status follows the delivery log', async () => {
    const form = await createForm(app, { delivery: withHook, sections: contact })
    hookStatus = 500
    const { body } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    const sub = await readSubmission(app, body.submissionId)
    expect(sub.status).toBe('partlyFailed')
    expect(sub.deliveryLog.map((e: Doc) => `${e.kind}:${e.label}:${e.result}`)).toEqual(['email:Team:success', 'webhook:CRM:failed'])
    expect(sub.deliveryLog[1].error).toContain('500')
  })

  test('resend runs only failed outputs and updates status', async () => {
    const form = await createForm(app, { delivery: withHook, sections: contact })
    hookStatus = 500
    const { body } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    outbox.length = 0
    hookCalls.length = 0
    hookStatus = 200
    const res = await app.fetch(`/custom-form-submissions/${body.submissionId}/resend`, { method: 'POST', token: adminToken })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, resent: 1, status: 'processed' })
    expect(outbox).toHaveLength(0)
    expect(hookCalls).toEqual(['https://hooks.example.com/crm'])
    const sub = await readSubmission(app, body.submissionId)
    expect(sub.status).toBe('processed')
    expect(sub.deliveryLog.map((e: Doc) => `${e.kind}:${e.result}`)).toEqual(['email:success', 'webhook:failed', 'webhook:success'])
  })

  test('sidebar tick resends and clears itself', async () => {
    const form = await createForm(app, { delivery: withHook, sections: contact })
    hookStatus = 500
    const { body } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    hookCalls.length = 0
    hookStatus = 200
    const res = await app.fetch(`/custom-form-submissions/${body.submissionId}`, {
      json: { resendFailed: true },
      method: 'PATCH',
      token: adminToken,
    })
    expect(res.status).toBe(200)
    expect(hookCalls).toEqual(['https://hooks.example.com/crm'])
    const sub = await readSubmission(app, body.submissionId)
    expect(sub.resendFailed).toBe(false)
    expect(sub.status).toBe('processed')
    expect(sub.deliveryLog.map((e: Doc) => e.result)).toEqual(['success', 'failed', 'success'])
  })

  test('resend refuses non-admins', async () => {
    const form = await createForm(app, { delivery: withHook, sections: contact })
    hookStatus = 500
    const { body } = await submit(app, form.slug, { email: 'ana@example.com', name: 'Ana' })
    hookCalls.length = 0
    outbox.length = 0
    hookStatus = 200
    for (const token of [undefined, editorToken]) {
      const res = await app.fetch(`/custom-form-submissions/${body.submissionId}/resend`, { method: 'POST', token })
      expect(res.status).toBe(403)
    }
    // The sidebar tick is an update, which only admins may do.
    const tick = await app.fetch(`/custom-form-submissions/${body.submissionId}`, { json: { resendFailed: true }, method: 'PATCH', token: editorToken })
    expect(tick.status).toBe(403)
    expect(hookCalls).toEqual([])
    expect(outbox).toEqual([])
    expect((await readSubmission(app, body.submissionId)).status).toBe('partlyFailed')
  })
})
