import { hmacSha256Hex } from '../security/crypto.js'

export type WebhookSettings = {
  headers?: Array<{ key?: null | string; value?: null | string }> | null
  method?: 'PATCH' | 'POST' | 'PUT' | null
  retries?: null | number
  signingSecret?: null | string
  timeoutMs?: null | number
  url?: null | string
}

export type WebhookResult = { error?: string; ok: boolean; status?: number; tries: number }

/** Pauses between tries: 0.5 s, 1 s, 2 s. */
export const RETRY_PAUSES_MS = [500, 1000, 2000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** `X-Form-Signature` value: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export async function signWebhookBody(secret: string, body: string, now = Date.now()): Promise<string> {
  const t = Math.floor(now / 1000)
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`
}

/**
 * Sends one webhook: JSON body, secret headers, optional signature, a timeout per try (default
 * 8 s) and up to 3 retries with growing pauses. A non-2xx answer or a timeout is a failed try.
 */
export async function sendWebhook(settings: WebhookSettings, body: unknown): Promise<WebhookResult> {
  const json = JSON.stringify(body)
  const timeoutMs = Math.min(30_000, Math.max(500, Number(settings.timeoutMs) || 8000))
  const retries = Math.min(3, Math.max(0, Math.floor(Number(settings.retries) || 0)))
  let lastError = ''
  let lastStatus: number | undefined
  let tries = 0
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_PAUSES_MS[Math.min(attempt - 1, RETRY_PAUSES_MS.length - 1)])
    }
    tries += 1
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    for (const header of settings.headers || []) {
      if (header?.key && header.value) {
        headers[header.key] = header.value
      }
    }
    if (settings.signingSecret) {
      headers['X-Form-Signature'] = await signWebhookBody(settings.signingSecret, json)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(String(settings.url || ''), {
        body: json,
        headers,
        method: settings.method || 'POST',
        signal: controller.signal,
      })
      lastStatus = response.status
      if (response.ok) {
        return { ok: true, status: response.status, tries }
      }
      lastError = `Webhook answered ${response.status}.`
    } catch (error) {
      lastStatus = undefined
      lastError = controller.signal.aborted
        ? `Webhook timed out after ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : String(error)
    } finally {
      clearTimeout(timer)
    }
  }
  return { error: lastError, ok: false, status: lastStatus, tries }
}
