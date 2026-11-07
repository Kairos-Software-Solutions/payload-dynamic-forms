import type { Payload, SanitizedConfig } from 'payload'

import { getPayload, handleEndpoints } from 'payload'

import { buildDevConfig, type DevConfigArgs } from '../../dev/payload.config.js'
import { emailControl, outbox } from '../../dev/helpers/testEmailAdapter.js'

export { emailControl, outbox }

export type App = {
  config: SanitizedConfig
  /** Calls the REST API like a browser would (custom endpoints included). */
  fetch: (path: string, init?: RequestInit & { json?: unknown; token?: string }) => Promise<Response>
  key: string
  payload: Payload
}

let counter = 0

/** Boots the dev app (SQLite in a temp file) with extra plugin options. */
export async function startApp(args: DevConfigArgs = {}): Promise<App> {
  counter += 1
  const key = `forms-test-${process.pid}-${counter}`
  const config = await buildDevConfig(args)
  const payload = await getPayload({ config, key })
  const call: App['fetch'] = async (path, init = {}) => {
    const { json, token, ...rest } = init
    const headers = new Headers(rest.headers)
    if (json !== undefined) {
      headers.set('content-type', 'application/json')
    }
    if (token) {
      headers.set('authorization', `JWT ${token}`)
    }
    if (!headers.has('cf-connecting-ip')) {
      headers.set('cf-connecting-ip', `198.51.100.${Math.floor(Math.random() * 250) + 1}`)
    }
    const request = new Request(`http://localhost:3000/api${path}`, {
      ...rest,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      headers,
    })
    return handleEndpoints({ config, payloadInstanceCacheKey: key, request })
  }
  return { config, fetch: call, key, payload }
}

export async function login(app: App, role: 'admin' | 'editor'): Promise<string> {
  const email = `${role}-${Math.random().toString(36).slice(2)}@example.com`
  const password = 'test-password-not-secret'
  await app.payload.create({ collection: 'users', data: { email, password, role } as never, overrideAccess: true })
  const result = await app.payload.login({ collection: 'users', data: { email, password } })
  return result.token!
}

type FieldSpec = Record<string, unknown> & { blockType: string; fieldKey?: string; label?: string }

/** A field block with its label in the words group. */
export function field(blockType: string, fieldKey: string, extra: Record<string, unknown> = {}): FieldSpec {
  const { label, words, ...rest } = extra as { label?: string; words?: Record<string, unknown> }
  return { blockType, fieldKey, ...rest, words: { label: label || fieldKey, ...words } }
}

export function section(key: string, fields: FieldSpec[], extra: Record<string, unknown> = {}) {
  return { key, title: `Section ${key}`, fields, ...extra }
}

let slugCounter = 0

/** Creates (and by default publishes) a form with the Local API as a trusted setup step. */
export async function createForm(
  app: App,
  data: Record<string, unknown> & { sections: unknown[] },
  { draft = false } = {},
): Promise<{ id: number | string; slug: string } & Record<string, unknown>> {
  slugCounter += 1
  const slug = (data.slug as string) || `form-${process.pid}-${slugCounter}-${Math.random().toString(36).slice(2, 7)}`
  const doc = await app.payload.create({
    collection: 'custom-forms',
    data: {
      title: data.title || `Form ${slugCounter}`,
      generateSlug: false,
      slug,
      _status: draft ? 'draft' : 'published',
      ...data,
    } as never,
    draft,
    overrideAccess: true,
  })
  return doc as never
}

/** The messages of a ValidationError (or the error text). */
export async function saveError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    const data = (error as { data?: { errors?: Array<{ message: string }> } }).data
    return [String((error as Error).message), ...(data?.errors || []).map((e) => e.message)].join('\n')
  }
  throw new Error('Expected the save to fail, but it passed.')
}
