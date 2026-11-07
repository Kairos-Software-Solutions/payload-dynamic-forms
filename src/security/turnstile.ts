export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

type Logger = { error: (msg: unknown, ...rest: unknown[]) => void }

/**
 * Verifies a Turnstile token with Cloudflare's siteverify: secret, token, visitor IP and an
 * idempotency key (safe retries). Any error counts as a failed check.
 */
export async function verifyTurnstile(args: {
  idempotencyKey?: string
  ip?: string
  secret: string
  token: string
}): Promise<boolean> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      body: JSON.stringify({
        idempotency_key: args.idempotencyKey || crypto.randomUUID(),
        remoteip: args.ip || undefined,
        response: args.token,
        secret: args.secret,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok) {
      return false
    }
    const data = (await response.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

const warned = new WeakSet<object>()

/**
 * The Turnstile check for one plugin setup. Off: passes. On without a secret: refuses every
 * submission and logs one error line. On: the token must verify.
 */
export async function checkTurnstile(args: {
  ip: string
  logger: Logger
  settings: { enabled: boolean; secretKey: string }
  token: unknown
}): Promise<boolean> {
  const { settings } = args
  if (!settings.enabled) {
    return true
  }
  if (!settings.secretKey) {
    if (!warned.has(settings)) {
      warned.add(settings)
      args.logger.error('payload-dynamic-forms: Turnstile is on but has no secret key; every submission is refused.')
    }
    return false
  }
  const token = Array.isArray(args.token) ? args.token[0] : args.token
  if (typeof token !== 'string' || !token.trim()) {
    return false
  }
  return verifyTurnstile({ idempotencyKey: crypto.randomUUID(), ip: args.ip, secret: settings.secretKey, token: token.trim() })
}
