/**
 * Fails any request that leaves the machine. Tests that need Turnstile or a webhook stub `fetch`
 * themselves (vi.stubGlobal); everything else must stay on localhost.
 */
import http from 'node:http'
import https from 'node:https'

type Guarded = typeof globalThis & { __outsideRequests?: string[]; __realFetch?: typeof fetch }

const g = globalThis as Guarded
g.__outsideRequests = g.__outsideRequests || []

const LOCAL = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])

export function isLocal(target: string): boolean {
  try {
    return LOCAL.has(new URL(target).hostname)
  } catch {
    return true
  }
}

function refuse(target: string): Error {
  g.__outsideRequests!.push(target)
  return new Error(`Outside request blocked in tests: ${target}`)
}

if (!g.__realFetch) {
  g.__realFetch = globalThis.fetch
  const guarded: typeof fetch = (input, init) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!isLocal(target)) {
      return Promise.reject(refuse(target))
    }
    return g.__realFetch!(input, init)
  }
  globalThis.fetch = guarded

  for (const mod of [http, https] as const) {
    const originalRequest = mod.request.bind(mod)
    const originalGet = mod.get.bind(mod)
    const host = (args: unknown[]): string => {
      const first = args[0]
      if (typeof first === 'string' || first instanceof URL) {
        return String(first)
      }
      const o = (first || {}) as { host?: string; hostname?: string; protocol?: string }
      return `${o.protocol || 'http:'}//${o.hostname || o.host || 'localhost'}`
    }
    ;(mod as { request: unknown }).request = (...args: unknown[]) => {
      const target = host(args)
      if (!isLocal(target)) {
        throw refuse(target)
      }
      return (originalRequest as (...a: unknown[]) => unknown)(...args)
    }
    ;(mod as { get: unknown }).get = (...args: unknown[]) => {
      const target = host(args)
      if (!isLocal(target)) {
        throw refuse(target)
      }
      return (originalGet as (...a: unknown[]) => unknown)(...args)
    }
  }
}
