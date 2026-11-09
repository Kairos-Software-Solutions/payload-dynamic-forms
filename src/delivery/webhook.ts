import { hmacSha256Hex } from '../security/crypto.js'

export type WebhookSettings = {
  /**
   * Headers applied under the admin `headers` (e.g. resolved from the plugin config). A later
   * header replaces an earlier one of the same name, in any case.
   */
  configHeaders?: null | Record<string, string>
  /** The webhook's own (admin) secret headers. */
  headers?: Array<{ key?: null | string; value?: null | string }> | null
  method?: 'PATCH' | 'POST' | 'PUT' | null
  retries?: null | number
  /** The secret to sign with, already resolved. Empty: the request is sent unsigned. */
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
 * Request headers in order, a later one replacing an earlier one whose name matches in any case:
 * `Content-Type`, then each group in turn.
 */
function mergeHeaders(...groups: Array<Array<[string, string]>>): Record<string, string> {
  const merged = new Map<string, [string, string]>([['content-type', ['Content-Type', 'application/json']]])
  for (const group of groups) {
    for (const [key, value] of group) {
      merged.set(key.toLowerCase(), [key, value])
    }
  }
  return Object.fromEntries(merged.values())
}

/**
 * Sends one webhook: JSON body, config headers under the secret headers, an optional signature
 * (given resolved), a timeout per try (default 8 s) and up to 3 retries with growing pauses. A
 * non-2xx answer or a timeout is a failed try.
 */
export async function sendWebhook(settings: WebhookSettings, body: unknown): Promise<WebhookResult> {
  const json = JSON.stringify(body)
  const timeoutMs = Math.min(30_000, Math.max(500, Number(settings.timeoutMs) || 8000))
  const retries = Math.min(3, Math.max(0, Math.floor(Number(settings.retries) || 0)))
  const configHeaders = Object.entries(settings.configHeaders || {}).filter(
    (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string',
  )
  const adminHeaders = (settings.headers || []).flatMap((header): Array<[string, string]> =>
    header?.key && header.value ? [[header.key, header.value]] : [],
  )
  const secret = settings.signingSecret || ''
  let lastError = ''
  let lastStatus: number | undefined
  let tries = 0
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_PAUSES_MS[Math.min(attempt - 1, RETRY_PAUSES_MS.length - 1)])
    }
    tries += 1
    const signature: Array<[string, string]> = []
    if (secret) {
      signature.push(['X-Form-Signature', await signWebhookBody(secret, json)])
    }
    const headers = mergeHeaders(configHeaders, adminHeaders, signature)
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
