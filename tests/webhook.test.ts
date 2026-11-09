import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { FormDelivery } from '../src/server/forms.js'
import type { ResolvedOptions } from '../src/types.js'

import { runDeliveries, statusFromLog } from '../src/delivery/run.js'
import { sendWebhook } from '../src/delivery/webhook.js'

type Call = { at: number; headers: Headers; init: RequestInit; url: string }

function stubFetch(respond: (call: Call, index: number) => Promise<Response> | Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { at: Date.now(), headers: new Headers(init.headers), init, url: String(input) }
    calls.push(call)
    return Promise.resolve(respond(call, calls.length - 1))
  })
  return calls
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function deliveryWith(hook: FormDelivery['webhooks'][number]): FormDelivery {
  return { emails: [], store: true, webhooks: [hook], whatsapp: { enabled: false } }
}

async function deliver(hook: FormDelivery['webhooks'][number]) {
  return runDeliveries({
    answers: { name: 'Ana' },
    delivery: deliveryWith(hook),
    form: { id: 1, slug: 'contact', title: 'Contact' } as never,
    options: { fieldTypes: {} } as never,
    payload: {} as never,
    req: {} as never,
    snapshot: [],
    submissionId: 7,
  })
}

describe('webhooks', () => {
  test('request carries secret headers and a valid signature', async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }))
    const before = Math.floor(Date.now() / 1000)
    const result = await sendWebhook(
      {
        headers: [{ key: 'X-Api-Key', value: 'header-value' }],
        method: 'PUT',
        signingSecret: 'signing-secret-for-tests',
        url: 'https://hooks.example.com/in',
      },
      { answers: { name: 'Ana' } },
    )
    expect(result).toEqual({ ok: true, status: 204, tries: 1 })
    const [call] = calls
    expect(call.url).toBe('https://hooks.example.com/in')
    expect(call.init.method).toBe('PUT')
    expect(call.headers.get('x-api-key')).toBe('header-value')
    expect(call.headers.get('content-type')).toBe('application/json')
    const body = String(call.init.body)
    expect(JSON.parse(body)).toEqual({ answers: { name: 'Ana' } })
    const signature = call.headers.get('x-form-signature')!
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature)
    expect(match).not.toBeNull()
    const t = Number(match![1])
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
    expect(match![2]).toBe(createHmac('sha256', 'signing-secret-for-tests').update(`${t}.${body}`).digest('hex'))
  })

  test('retries until success or the limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const statuses = [500, 500, 200]
    const calls = stubFetch((_call, i) => new Response(null, { status: statuses[i] ?? 500 }))
    const first = deliver({ id: 'hook-1', label: 'CRM', retries: 2, url: 'https://hooks.example.com/crm' })
    await vi.runAllTimersAsync()
    const [ok] = await first
    expect(ok).toMatchObject({ kind: 'webhook', label: 'CRM', outputId: 'hook-1', result: 'success', tries: 3 })
    expect(calls).toHaveLength(3)
    // Growing pauses: 0.5 s, then 1 s.
    expect([calls[1].at - calls[0].at, calls[2].at - calls[1].at]).toEqual([500, 1000])

    const failing = stubFetch(() => new Response(null, { status: 503 }))
    const second = deliver({ id: 'hook-2', label: 'Backup', retries: 2, url: 'https://hooks.example.com/backup' })
    await vi.runAllTimersAsync()
    const [failed] = await second
    expect(failed).toMatchObject({ label: 'Backup', result: 'failed', tries: 3 })
    expect(failed.error).toContain('503')
    expect(failing).toHaveLength(3)
  })

  test('timeout aborts and counts as failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let signal: AbortSignal | undefined
    stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          signal = call.init.signal as AbortSignal
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = deliver({ id: 'hook-3', label: 'Slow', timeoutMs: 1000, url: 'https://hooks.example.com/slow' })
    await vi.advanceTimersByTimeAsync(999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const [entry] = await pending
    expect(signal?.aborted).toBe(true)
    expect(entry).toMatchObject({ result: 'failed', tries: 1 })
    expect(entry.error).toMatch(/timed out after 1000 ms/)
  })
})

type Hook = FormDelivery['webhooks'][number]
type WebhooksConfig = Partial<ResolvedOptions['webhooks']>

/** Runs the given webhooks through runDeliveries with resolved webhook options. */
async function deliverAll(
  hooks: Hook[],
  {
    form = { id: 1, slug: 'contact', title: 'Contact' },
    logger = { warn: vi.fn() },
    req = {},
    store = true,
    submissionId = 7,
    webhooks = {},
  }: {
    form?: Record<string, unknown>
    logger?: { warn: (...args: unknown[]) => void }
    req?: Record<string, unknown>
    store?: boolean
    submissionId?: number | string
    webhooks?: WebhooksConfig
  } = {},
) {
  return runDeliveries({
    answers: { name: 'Ana' },
    delivery: { emails: [], store, webhooks: hooks, whatsapp: { enabled: false } },
    form: form as never,
    options: { fieldTypes: {}, webhooks: { requireSignature: false, secretsInAdmin: true, ...webhooks } } as never,
    payload: { logger } as never,
    req: req as never,
    snapshot: [],
    submissionId: store ? submissionId : undefined,
  })
}

/** True when the call's X-Form-Signature is a valid HMAC of its body with `secret`. */
function signedWith(call: Call, secret: string): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(call.headers.get('x-form-signature') || '')
  if (!match) {
    return false
  }
  return match[2] === createHmac('sha256', secret).update(`${match[1]}.${call.init.body as string}`).digest('hex')
}

describe('webhook secrets from the plugin config', () => {
  test('config secret signs a webhook with no admin secret', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const [entry] = await deliverAll([{ id: 'cfg-1', label: 'CRM', signingSecret: '', url: 'https://hooks.example.com/crm' }], {
      webhooks: { signingSecret: 'config-secret-for-tests' },
    })
    expect(entry).toMatchObject({ result: 'success', tries: 1 })
    expect(calls).toHaveLength(1)
    expect(signedWith(calls[0], 'config-secret-for-tests')).toBe(true)
  })

  test('admin secret wins over the config secret', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const configSecret = vi.fn(() => 'config-secret-for-tests')
    await deliverAll([{ id: 'cfg-2', label: 'CRM', signingSecret: 'admin-secret-for-tests', url: 'https://hooks.example.com/crm' }], {
      webhooks: { signingSecret: 'config-secret-for-tests' },
    })
    await deliverAll([{ id: 'cfg-3', label: 'CRM', signingSecret: 'admin-secret-for-tests', url: 'https://hooks.example.com/crm' }], {
      webhooks: { signingSecret: configSecret },
    })
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(signedWith(call, 'admin-secret-for-tests')).toBe(true)
      expect(signedWith(call, 'config-secret-for-tests')).toBe(false)
    }
    // The fallback isn't asked for when the admin secret is set.
    expect(configSecret).not.toHaveBeenCalled()
  })

  test('secret function picks a secret per webhook', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const secrets: Record<string, string> = { Backup: 'backup-secret-for-tests', CRM: 'crm-secret-for-tests' }
    const seen: unknown[] = []
    const form = { id: 3, slug: 'quote', title: 'Quote' }
    const req = { marker: 'the-request' }
    const signingSecret = async (args: { webhook: { label: null | string } }) => {
      seen.push(args)
      await Promise.resolve()
      return secrets[String(args.webhook.label)]
    }
    const entries = await deliverAll(
      [
        { id: 'fn-crm', label: 'CRM', url: 'https://hooks.example.com/crm' },
        { id: 'fn-backup', label: 'Backup', url: 'https://hooks.example.com/backup' },
      ],
      { form, req, webhooks: { signingSecret: signingSecret as never } },
    )
    expect(entries.map((e) => e.result)).toEqual(['success', 'success'])
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual({ form, req, webhook: { id: 'fn-crm', label: 'CRM', url: 'https://hooks.example.com/crm' } })
    expect(seen[1]).toEqual({ form, req, webhook: { id: 'fn-backup', label: 'Backup', url: 'https://hooks.example.com/backup' } })
    expect((seen[0] as { form: unknown }).form).toBe(form)
    expect((seen[0] as { req: unknown }).req).toBe(req)
    const crm = calls.find((c) => c.url.endsWith('/crm'))!
    const backup = calls.find((c) => c.url.endsWith('/backup'))!
    expect(signedWith(crm, 'crm-secret-for-tests')).toBe(true)
    expect(signedWith(crm, 'backup-secret-for-tests')).toBe(false)
    expect(signedWith(backup, 'backup-secret-for-tests')).toBe(true)
    expect(signedWith(backup, 'crm-secret-for-tests')).toBe(false)
  })

  test('config headers merge under admin headers and never replace the signature', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    await deliverAll(
      [
        {
          id: 'hdr-1',
          headers: [
            { key: 'x-api-key', value: 'from-admin' },
            { key: 'x-form-signature', value: 'forged-by-admin-header' },
          ],
          label: 'CRM',
          signingSecret: 'admin-secret-for-tests',
          url: 'https://hooks.example.com/crm',
        },
      ],
      {
        webhooks: {
          headers: () => Promise.resolve({ 'X-Api-Key': 'from-config', 'X-Extra': '1', 'X-Form-Signature': 'forged-by-config' }),
        },
      },
    )
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.headers.get('x-api-key')).toBe('from-admin')
    expect(call.headers.get('x-extra')).toBe('1')
    expect(call.headers.get('content-type')).toBe('application/json')
    expect(signedWith(call, 'admin-secret-for-tests')).toBe(true)
    // One entry per name: the later one replaced the earlier, whatever its case.
    const names = Object.keys(call.init.headers as Record<string, string>).map((k) => k.toLowerCase())
    expect(names.filter((n) => n === 'x-api-key')).toHaveLength(1)
    expect(names.filter((n) => n === 'x-form-signature')).toHaveLength(1)
  })

  test('unsigned webhook warns once per webhook', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const warn = vi.fn()
    const form = { id: 'warn-form-1', slug: 'callback', title: 'Callback' }
    const first = { id: 'warn-a', label: 'Sheet', url: 'https://hooks.example.com/sheet' }
    const second = { id: 'warn-b', label: 'Chat', url: 'https://hooks.example.com/chat' }
    for (let i = 0; i < 3; i += 1) {
      await deliverAll([first], { form, logger: { warn } })
    }
    await deliverAll([second], { form, logger: { warn } })
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call.headers.has('x-form-signature')).toBe(false)
    }
    expect(warn).toHaveBeenCalledTimes(2)
    const lines = warn.mock.calls.map((c) => String(c[0]))
    expect(lines[0]).toBe('payload-dynamic-forms: webhook "Sheet" on form "callback" is sent unsigned; set a signing secret.')
    expect(lines[1]).toBe('payload-dynamic-forms: webhook "Chat" on form "callback" is sent unsigned; set a signing secret.')
  })

  test('requireSignature refuses an unsigned webhook', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const warn = vi.fn()
    const entries = await deliverAll(
      [
        { id: 'req-unsigned', label: 'Unsigned', url: 'https://hooks.example.com/unsigned' },
        { id: 'req-signed', label: 'Signed', signingSecret: 'admin-secret-for-tests', url: 'https://hooks.example.com/signed' },
      ],
      { form: { id: 'req-form', slug: 'strict', title: 'Strict' }, logger: { warn }, webhooks: { requireSignature: true } },
    )
    expect(calls.map((c) => c.url)).toEqual(['https://hooks.example.com/signed'])
    expect(entries[0]).toMatchObject({
      error: 'Webhook not sent: no signing secret.',
      kind: 'webhook',
      label: 'Unsigned',
      outputId: 'req-unsigned',
      result: 'failed',
      tries: 0,
    })
    expect(entries[1]).toMatchObject({ label: 'Signed', result: 'success', tries: 1 })
    expect(signedWith(calls[0], 'admin-secret-for-tests')).toBe(true)
    expect(statusFromLog(entries)).toBe('partlyFailed')
  })
})
