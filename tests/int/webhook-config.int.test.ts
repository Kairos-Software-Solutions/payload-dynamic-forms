import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { type App, createForm, field, login, section, startApp, submit } from './helpers.js'

type HookCall = { body: string; headers: Headers; url: string }

let app: App
let adminToken: string
const hookCalls: HookCall[] = []

beforeAll(async () => {
  app = await startApp({ plugin: { webhooks: { secretsInAdmin: false, signingSecret: 'config-secret-for-tests' } } })
  adminToken = await login(app, 'admin')
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://hooks.example.com/')) {
      hookCalls.push({ body: init?.body as string, headers: new Headers(init?.headers), url })
      return Promise.resolve(new Response(null, { status: 200 }))
    }
    return realFetch(input, init)
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await app?.payload.destroy()
})

describe('webhook secrets from config', () => {
  test('config secret signs when admin secret fields are off', async () => {
    const form = await createForm(app, {
      delivery: { webhooks: [{ label: 'CRM', url: 'https://hooks.example.com/crm' }] },
      sections: [section('s', [field('text', 'name', { required: true })])],
    })
    const { body, status } = await submit(app, form.slug, { name: 'Ana' })
    expect(status).toBe(200)

    expect(hookCalls).toHaveLength(1)
    const [call] = hookCalls
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(call.headers.get('x-form-signature') || '')
    expect(match).not.toBeNull()
    expect(match![2]).toBe(createHmac('sha256', 'config-secret-for-tests').update(`${match![1]}.${call.body}`).digest('hex'))
    expect(call.headers.get('webhook-signature')).toMatch(/^v1,/)
    expect(JSON.parse(call.body)).toMatchObject({ answers: { name: 'Ana' }, submission: { id: body.submissionId } })

    const sub = await app.payload.findByID({ id: body.submissionId, collection: 'custom-form-submissions' as never, overrideAccess: true })
    expect((sub as unknown as { deliveryLog: Array<{ result: string }> }).deliveryLog.map((e) => e.result)).toEqual(['success'])

    // Even an admin sees no secret fields: they aren't in the collection at all.
    const res = await app.fetch(`/custom-forms/${form.id}`, { token: adminToken })
    expect(res.status).toBe(200)
    const doc = await res.json()
    const hook = doc.delivery.webhooks[0]
    expect(hook.url).toBe('https://hooks.example.com/crm')
    expect(hook).not.toHaveProperty('signingSecret')
    expect(hook).not.toHaveProperty('headers')
  })
})
