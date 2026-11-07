import type { Payload } from 'payload'

import { sha256Hex } from './crypto.js'

type Entry = { count: number; start: number }

/**
 * Soft per-form, per-visitor limit in Payload's KV store. The key holds a hash of the IP and the
 * app secret, never the IP. Returns false when the visitor is over the limit.
 */
export async function checkRateLimit(args: {
  formId: number | string
  ip: string
  max: number
  now?: number
  payload: Payload
  windowSeconds: number
}): Promise<boolean> {
  const { payload } = args
  const now = args.now ?? Date.now()
  const hash = await sha256Hex(`${args.ip || 'unknown'}${payload.secret}`)
  const key = `forms:rl:${args.formId}:${hash}`
  const entry = await payload.kv.get<Entry>(key)
  if (!entry || typeof entry.start !== 'number' || now - entry.start >= args.windowSeconds * 1000) {
    await payload.kv.set(key, { count: 1, start: now })
    return true
  }
  if (entry.count >= args.max) {
    return false
  }
  await payload.kv.set(key, { count: entry.count + 1, start: entry.start })
  return true
}
