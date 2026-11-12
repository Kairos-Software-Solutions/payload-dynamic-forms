import type { Payload, PayloadRequest, SanitizedConfig } from 'payload'

import { getPayload, handleEndpoints } from 'payload'

import { emailControl, outbox } from '../../dev/helpers/testEmailAdapter.js'
import { buildDevConfig, type DevConfigArgs } from '../../dev/payload.config.js'

export { emailControl, outbox }

export type App = {
  config: SanitizedConfig
  /** Calls the REST API like a browser would (custom endpoints included). */
  fetch: (path: string, init?: { json?: unknown; token?: string } & RequestInit) => Promise<Response>
  key: string
  payload: Payload
}

/** A Payload document read loosely in tests (nested rows and words are edited in place). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixtures walk arbitrary nested document shapes
export type Doc = Record<string, any>

let counter = 0

/** Boots the dev app (SQLite in a temp file) with extra plugin options. */
export async function startApp(args: DevConfigArgs = {}): Promise<App> {
  counter += 1
  const key = `forms-test-${process.pid}-${counter}`
  // Each app has its own fresh SQLite file; Payload skips the push when the schema equals the last
  // one pushed in this process, so force it.
  process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true'
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
  await app.payload.create({ collection: 'users', data: { email, password, role }, overrideAccess: true })
  const result = await app.payload.login({ collection: 'users', data: { email, password } })
  return result.token!
}

/** Creates a user and logs in: the token for REST calls and the user for Local API calls. */
export async function loginUser(app: App, role: 'admin' | 'editor'): Promise<{ token: string; user: NonNullable<PayloadRequest['user']> }> {
  const email = `${role}-${Math.random().toString(36).slice(2)}@example.com`
  const password = 'test-password-not-secret'
  await app.payload.create({ collection: 'users', data: { email, password, role }, overrideAccess: true })
  const result = await app.payload.login({ collection: 'users', data: { email, password } })
  return { token: result.token!, user: result.user as never }
}

type FieldSpec = { blockType: string; fieldKey?: string; label?: string } & Record<string, unknown>

/** A field block with its label in the words group. */
export function field(blockType: string, fieldKey: string, extra: Record<string, unknown> = {}): FieldSpec {
  const { label, words, ...rest } = extra as { label?: string; words?: Record<string, unknown> }
  return { blockType, fieldKey, ...rest, words: { label: label || fieldKey, ...words } }
}

export function section(key: string, fields: FieldSpec[], extra: Record<string, unknown> = {}) {
  return { fields, key, title: `Section ${key}`, ...extra }
}

let slugCounter = 0

/** Creates (and by default publishes) a form with the Local API as a trusted setup step. */
export async function createForm(
  app: App,
  data: { sections: unknown[] } & Record<string, unknown>,
  { draft = false } = {},
): Promise<{ id: number | string; slug: string } & Record<string, unknown>> {
  slugCounter += 1
  const slug = (data.slug as string) || `form-${process.pid}-${slugCounter}-${Math.random().toString(36).slice(2, 7)}`
  const doc = await app.payload.create({
    collection: 'custom-forms',
    data: {
      slug,
      _status: draft ? 'draft' : 'published',
      generateSlug: false,
      title: data.title || `Form ${slugCounter}`,
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

/** Posts answers as JSON to the submit endpoint. */
export async function submit(
  app: App,
  slug: string,
  answers: Record<string, unknown>,
  { headers, locale }: { headers?: Record<string, string>; locale?: string } = {},
): Promise<{ body: Record<string, any>; status: number }> {
  const res = await app.fetch(`/custom-forms/submit/${slug}${locale ? `?locale=${locale}` : ''}`, {
    headers,
    json: answers,
    method: 'POST',
  })
  return { body: (await res.json()) as Record<string, any>, status: res.status }
}

export async function countDocs(app: App, collection: string): Promise<number> {
  return (await app.payload.count({ collection: collection as never, overrideAccess: true })).totalDocs
}

/**
 * Saves another locale's words on a published form: reads it in `locale` as stored (no fallback,
 * so nothing is copied from the default locale), lets `edit` change it, and saves it in `locale`.
 */
export async function translateForm(app: App, id: number | string, locale: string, edit: (doc: Doc) => void): Promise<void> {
  const doc = (await app.payload.findByID({
    id,
    collection: 'custom-forms',
    depth: 0,
    draft: false,
    fallbackLocale: false,
    locale: locale,
    overrideAccess: true,
  })) as Doc
  edit(doc)
  const { id: _id, createdAt: _c, updatedAt: _u, ...data } = doc
  await app.payload.update({ id, collection: 'custom-forms', data: data, locale: locale, overrideAccess: true })
}
