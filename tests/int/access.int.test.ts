import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type App, createForm, field, login, section, startApp } from './helpers.js'

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
})
