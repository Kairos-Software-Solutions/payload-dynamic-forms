import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type App, createForm, type Doc, field, login, loginUser, section, startApp } from './helpers.js'

let app: App
let adminToken: string
let editorToken: string

beforeAll(async () => {
  app = await startApp()
  adminToken = await login(app, 'admin')
  editorToken = await login(app, 'editor')
})

afterAll(async () => {
  await app?.payload.destroy()
})

const delivery = {
  emails: [{ kind: 'team', label: 'Team', to: 'team@example.com' }],
  webhooks: [
    {
      headers: [{ key: 'X-Api-Key', value: 'header-secret-value' }],
      label: 'CRM',
      signingSecret: 'signing-secret-value',
      url: 'https://hooks.example.com/in',
    },
  ],
  whatsapp: { enabled: true, number: '+1 555 000 1234' },
}

describe('access', () => {
  test('anonymous read hides delivery settings and drafts', async () => {
    const published = await createForm(app, { delivery, sections: [section('s', [field('text', 'name')])] })
    const draft = await createForm(app, { sections: [section('s', [field('text', 'name')])] }, { draft: true })

    const one = await app.fetch(`/custom-forms/${published.id}`)
    expect(one.status).toBe(200)
    const doc = await one.json()
    expect(doc.sections[0].fields[0].words.label).toBe('name')
    expect(doc.wording.send).toBe('Send now')
    expect(doc).not.toHaveProperty('delivery')
    expect(JSON.stringify(doc)).not.toMatch(/team@example\.com|hooks\.example\.com|secret-value|555 000 1234|whatsapp/)

    const list = await (await app.fetch('/custom-forms?limit=100')).json()
    const ids = list.docs.map((d: { id: number }) => d.id)
    expect(ids).toContain(published.id)
    expect(ids).not.toContain(draft.id)
    expect(list.docs.every((d: object) => !('delivery' in d))).toBe(true)
    expect((await app.fetch(`/custom-forms/${draft.id}`)).status).not.toBe(200)
    expect((await app.fetch(`/custom-forms/${draft.id}?draft=true`)).status).not.toBe(200)
  })

  test('webhook secrets are hidden from non-admins', async () => {
    const form = await createForm(app, { delivery, sections: [section('s', [field('text', 'name')])] })
    const asEditor = await (await app.fetch(`/custom-forms/${form.id}`, { token: editorToken })).json()
    expect(asEditor.delivery.emails[0].to).toBe('team@example.com')
    expect(asEditor.delivery.webhooks[0].url).toBe('https://hooks.example.com/in')
    // Payload returns a field without read access as missing (arrays as an empty list).
    expect(asEditor.delivery.webhooks[0].headers ?? []).toEqual([])
    expect(asEditor.delivery.webhooks[0]).not.toHaveProperty('signingSecret')
    expect(JSON.stringify(asEditor)).not.toMatch(/header-secret-value|signing-secret-value/)

    const asAdmin = await (await app.fetch(`/custom-forms/${form.id}`, { token: adminToken })).json()
    expect(asAdmin.delivery.webhooks[0].headers[0].value).toBe('header-secret-value')
    expect(asAdmin.delivery.webhooks[0].signingSecret).toBe('signing-secret-value')
  })

  test('anonymous create of submissions and attachments is refused', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    const sub = await app.fetch('/custom-form-submissions', {
      json: { answers: { name: 'x' }, form: form.id, snapshot: [] },
      method: 'POST',
    })
    expect(sub.status).toBe(403)

    const body = new FormData()
    body.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }))
    body.append('_payload', JSON.stringify({ fieldKey: 'x', form: form.id }))
    const file = await app.fetch('/custom-form-attachments', { body, method: 'POST' })
    expect(file.status).toBe(403)

    // Logged-in users can't create them through REST either.
    const asEditor = await app.fetch('/custom-form-submissions', {
      json: { answers: { name: 'x' }, form: form.id, snapshot: [] },
      method: 'POST',
      token: editorToken,
    })
    expect(asEditor.status).toBe(403)

    expect((await app.payload.count({ collection: 'custom-form-submissions' as never })).totalDocs).toBe(0)
    expect((await app.payload.count({ collection: 'custom-form-attachments' as never })).totalDocs).toBe(0)
  })

  test('submission records refuse edits, status stays editable', async () => {
    const { token, user } = await loginUser(app, 'admin')
    const form = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    const other = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    const created = (await app.payload.create({
      collection: 'custom-form-submissions' as never,
      data: {
        answers: { name: 'Ana' },
        deliveryLog: [{ at: '2026-11-12T10:00:00.000Z', kind: 'email', label: 'Team', result: 'success', tries: 1 }],
        form: form.id,
        metadata: { locale: 'en', timeZone: 'America/New_York', userAgent: 'test-agent' },
        snapshot: [{ fieldKey: 'name', label: 'name', sectionKey: 's', sectionTitle: 'Section s', value: 'Ana' }],
        status: 'processed',
      },
      overrideAccess: true,
    })) as Doc
    const read = async () =>
      (await app.payload.findByID({ id: created.id, collection: 'custom-form-submissions' as never, depth: 0, overrideAccess: true })) as Doc
    const record = (doc: Doc) => ({
      answers: doc.answers,
      deliveryLog: doc.deliveryLog,
      form: doc.form,
      metadata: doc.metadata,
      snapshot: doc.snapshot,
    })
    const before = record(await read())
    const edit = {
      answers: { name: 'Changed' },
      deliveryLog: [],
      form: other.id,
      metadata: { locale: 'es' },
      snapshot: [{ fieldKey: 'name', label: 'Changed', sectionKey: 's', sectionTitle: 'x', value: 'Changed' }],
    }
    const res = await app.fetch(`/custom-form-submissions/${created.id}`, { json: { ...edit, status: 'failed' }, method: 'PATCH', token })
    expect(res.status).toBe(200)
    const afterRest = await read()
    expect(afterRest.status).toBe('failed')
    expect(record(afterRest)).toEqual(before)
    await expect(
      app.payload.update({
        id: created.id,
        collection: 'custom-form-submissions' as never,
        data: { ...edit, status: 'partlyFailed' },
        overrideAccess: false,
        user,
      }),
    ).resolves.toBeDefined()
    const afterLocal = await read()
    expect(afterLocal.status).toBe('partlyFailed')
    expect(record(afterLocal)).toEqual(before)
    expect(afterLocal.metadata.locale).toBe('en')
    expect(afterLocal.form).toBe(form.id)
  })
})
