import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { type App, createForm, field, section, startApp, submit } from './int/helpers.js'

let app: App
let noSecret: App
const calls: Array<{ body: Record<string, unknown>; url: string }> = []
let answer: { success: boolean } = { success: true }

beforeAll(async () => {
  app = await startApp({ plugin: { turnstile: { secretKey: 'test-only-turnstile-secret' } } })
  noSecret = await startApp({ plugin: { turnstile: { enabled: true, secretKey: '' } } })
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      calls.push({ body: JSON.parse(String(init?.body)), url })
      return Response.json(answer)
    }
    return realFetch(input, init)
  })
})

afterEach(() => {
  calls.length = 0
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await Promise.all([app?.payload.destroy(), noSecret?.payload.destroy()])
})

const sections = [section('s', [field('text', 'name', { required: true })])]

describe('turnstile', () => {
  test('siteverify gets secret, token, ip and idempotency key and its answer decides', async () => {
    const form = await createForm(app, { sections, wording: { securityCheckFailed: 'Security check words.' } })
    const headers = { 'cf-connecting-ip': '192.0.2.21' }

    // Missing token: refused without asking Cloudflare.
    const missing = await submit(app, form.slug, { name: 'Ana' }, { headers })
    expect(missing).toEqual({ body: { message: 'Security check words.', ok: false }, status: 400 })
    expect(calls).toHaveLength(0)

    // Cloudflare says no.
    answer = { success: false }
    const refused = await submit(app, form.slug, { name: 'Ana', 'cf-turnstile-response': 'token-1' }, { headers })
    expect(refused).toEqual({ body: { message: 'Security check words.', ok: false }, status: 400 })

    // Cloudflare says yes.
    answer = { success: true }
    const accepted = await submit(app, form.slug, { name: 'Ana', 'cf-turnstile-response': 'token-2' }, { headers })
    expect(accepted.status).toBe(200)
    expect(accepted.body.ok).toBe(true)

    expect(calls).toHaveLength(2)
    for (const [i, call] of calls.entries()) {
      expect(call.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
      expect(call.body).toMatchObject({ remoteip: '192.0.2.21', response: `token-${i + 1}`, secret: 'test-only-turnstile-secret' })
      expect(call.body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
    }
    expect(calls[0].body.idempotency_key).not.toBe(calls[1].body.idempotency_key)
  })

  test('missing secret refuses submissions and logs once', async () => {
    const form = await createForm(noSecret, { sections })
    const error = vi.spyOn(noSecret.payload.logger, 'error')
    for (let i = 0; i < 3; i += 1) {
      const res = await submit(noSecret, form.slug, { name: 'Ana', 'cf-turnstile-response': 'token' }, { headers: { 'cf-connecting-ip': `192.0.2.3${i}` } })
      expect(res.status).toBe(400)
      expect(res.body.message).toBe('The security check failed. Please try again.')
    }
    const lines = error.mock.calls.filter((args) => JSON.stringify(args).includes('Turnstile'))
    expect(lines).toHaveLength(1)
    expect(calls).toHaveLength(0)
    expect((await noSecret.payload.count({ collection: 'custom-form-submissions' as never })).totalDocs).toBe(0)
  })
})
