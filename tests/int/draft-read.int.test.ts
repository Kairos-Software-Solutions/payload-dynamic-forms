import type { PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { DEFAULT_WORDS } from '../../src/exports/shared.js'
import { getPublicForm } from '../../src/index.js'
import { type App, countDocs, createForm, type Doc, field, loginUser, outbox, section, startApp, submit } from './helpers.js'

type User = NonNullable<PayloadRequest['user']>

let app: App
let appAccess: App
let editor: { token: string; user: User }
let accessEditor: User
let accessAdmin: User

beforeAll(async () => {
  app = await startApp()
  // Admins read every version; everyone else (editors included) reads published forms only.
  appAccess = await startApp({
    plugin: {
      formOverrides: {
        access: { read: ({ req }) => ((req.user as { role?: string } | null)?.role === 'admin' ? true : { _status: { equals: 'published' } }) },
      },
    },
  })
  editor = await loginUser(app, 'editor')
  accessEditor = (await loginUser(appAccess, 'editor')).user
  accessAdmin = (await loginUser(appAccess, 'admin')).user
})

beforeEach(() => {
  outbox.length = 0
})

afterAll(async () => {
  await Promise.all([app?.payload.destroy(), appAccess?.payload.destroy()])
})

const sections = [section('s', [field('text', 'name', { required: true, words: { label: 'Name' } })])]

/** A published form (send word `Send`) with a newer draft: `Send draft` and one more section. */
async function formWithDraft(target: App, extra: Record<string, unknown> = {}) {
  const form = (await createForm(target, { sections, wording: { send: 'Send', success: 'Thanks' }, ...extra })) as Doc
  await target.payload.update({
    id: form.id,
    collection: 'custom-forms',
    data: {
      sections: [...form.sections, section('more', [field('text', 'phone', { words: { label: 'Phone' } })])],
      wording: { ...form.wording, send: 'Send draft', success: 'Thanks draft' },
    },
    draft: true,
    overrideAccess: true,
  })
  return form as { id: number | string; slug: string } & Doc
}

const sectionKeys = (form: Doc | null) => (form?.sections || []).map((s: Doc) => s.key)

describe('draft read', () => {
  test('a logged-in draft read returns the newest draft', async () => {
    const form = await formWithDraft(app)
    const drafted = await getPublicForm(app.payload, form.slug, { draft: true, user: editor.user })
    expect(drafted?.wording.send).toBe('Send draft')
    expect(sectionKeys(drafted)).toEqual(['s', 'more'])
    const published = await getPublicForm(app.payload, form.slug)
    expect(published?.wording.send).toBe('Send')
    expect(sectionKeys(published)).toEqual(['s'])
    const anonymous = await getPublicForm(app.payload, form.slug, { draft: true })
    expect(anonymous?.wording.send).toBe('Send')
    expect(sectionKeys(anonymous)).toEqual(['s'])
  })

  test('anonymous draft requests get the published form', async () => {
    const form = await formWithDraft(app)
    const draftOnly = await createForm(app, { sections, wording: { send: 'Send draft' } }, { draft: true })
    const res = await app.fetch(`/custom-forms/public/${form.slug}?draft=true`)
    expect(res.status).toBe(200)
    expect((await res.json()).wording.send).toBe('Send')
    const missing = await app.fetch(`/custom-forms/public/${draftOnly.slug}?draft=true`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ message: DEFAULT_WORDS.notFound, ok: false })
    expect(await getPublicForm(app.payload, draftOnly.slug, { draft: true })).toBeNull()
  })

  test('a user the read access refuses gets the published form', async () => {
    const form = await formWithDraft(appAccess)
    const asEditor = await getPublicForm(appAccess.payload, form.slug, { draft: true, user: accessEditor })
    const asAdmin = await getPublicForm(appAccess.payload, form.slug, { draft: true, user: accessAdmin })
    expect(asEditor?.wording.send).toBe('Send')
    expect(sectionKeys(asEditor)).toEqual(['s'])
    expect(asAdmin?.wording.send).toBe('Send draft')
    expect(sectionKeys(asAdmin)).toEqual(['s', 'more'])
  })

  test('public endpoint serves drafts to logged-in requests, never cached', async () => {
    const form = await formWithDraft(app)
    const draftOnly = await createForm(app, { sections, wording: { send: 'Only a draft' } }, { draft: true })
    for (const [slug, words] of [
      [form.slug, 'Send draft'],
      [draftOnly.slug, 'Only a draft'],
    ]) {
      const res = await app.fetch(`/custom-forms/public/${slug}?draft=true`, { token: editor.token })
      expect(res.status, slug).toBe(200)
      expect(res.headers.get('cache-control'), slug).toBe('private, no-store')
      expect((await res.json()).wording.send, slug).toBe(words)
    }
    const plain = await app.fetch(`/custom-forms/public/${form.slug}`, { token: editor.token })
    expect(plain.status).toBe(200)
    expect(plain.headers.get('cache-control') || '').not.toContain('no-store')
    expect((await plain.json()).wording.send).toBe('Send')
  })

  test('a draft read reads option-source items as drafts', async () => {
    const suffix = Math.random().toString(36).slice(2, 7)
    const repairs = await app.payload.create({
      collection: 'topics' as never,
      data: { slug: `repairs-${suffix}`, _status: 'published', label: 'Repairs' },
      overrideAccess: true,
    })
    await app.payload.update({ id: repairs.id, collection: 'topics' as never, data: { label: 'Repairs and care' }, draft: true, overrideAccess: true })
    const fresh = await app.payload.create({
      collection: 'topics' as never,
      data: { slug: `restoration-${suffix}`, _status: 'draft', label: 'Restoration' },
      draft: true,
      overrideAccess: true,
    })
    const form = await createForm(app, {
      sections: [
        section('s', [
          field('radio', 'need', {
            optionsFrom: 'topics',
            sourceItems: [
              { relationTo: 'topics', value: repairs.id },
              { relationTo: 'topics', value: fresh.id },
            ],
          }),
        ]),
      ],
    })
    const labels = (read: Doc | null) => read?.sections[0].fields[0].options.map((o: Doc) => o.label)
    expect(labels(await getPublicForm(app.payload, form.slug, { draft: true, user: editor.user }))).toEqual(['Repairs and care', 'Restoration'])
    expect(labels(await getPublicForm(app.payload, form.slug))).toEqual(['Repairs'])
  })

  test('submit ignores drafts, also for logged-in users', async () => {
    const team = { emails: [{ kind: 'team', label: 'Team', to: 'team@example.com' }] }
    const form = await formWithDraft(app, { delivery: team })
    const headers = { authorization: `JWT ${editor.token}` }
    const ok = await submit(app, form.slug, { name: 'Ana' }, { headers })
    expect(ok.status).toBe(200)
    expect(ok.body.message).toBe('Thanks')

    const draftOnly = await createForm(app, { delivery: team, sections, wording: { success: 'Thanks draft' } }, { draft: true })
    outbox.length = 0
    const before = await countDocs(app, 'custom-form-submissions')
    const refused = await submit(app, draftOnly.slug, { name: 'Ana' }, { headers })
    expect(refused.status).toBe(404)
    expect(refused.body).toEqual({ message: DEFAULT_WORDS.notFound, ok: false })
    expect(await countDocs(app, 'custom-form-submissions')).toBe(before)
    expect(outbox).toEqual([])
  })
})
