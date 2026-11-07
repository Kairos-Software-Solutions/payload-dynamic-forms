import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { FormDelivery } from '../src/server/forms.js'

import { runDeliveries } from '../src/delivery/run.js'
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
    expect(call!.url).toBe('https://hooks.example.com/in')
    expect(call!.init.method).toBe('PUT')
    expect(call!.headers.get('x-api-key')).toBe('header-value')
    expect(call!.headers.get('content-type')).toBe('application/json')
    const body = String(call!.init.body)
    expect(JSON.parse(body)).toEqual({ answers: { name: 'Ana' } })
    const signature = call!.headers.get('x-form-signature')!
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
    expect([calls[1]!.at - calls[0]!.at, calls[2]!.at - calls[1]!.at]).toEqual([500, 1000])

    const failing = stubFetch(() => new Response(null, { status: 503 }))
    const second = deliver({ id: 'hook-2', label: 'Backup', retries: 2, url: 'https://hooks.example.com/backup' })
    await vi.runAllTimersAsync()
    const [failed] = await second
    expect(failed).toMatchObject({ label: 'Backup', result: 'failed', tries: 3 })
    expect(failed!.error).toContain('503')
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
    expect(entry!.error).toMatch(/timed out after 1000 ms/)
  })
})
