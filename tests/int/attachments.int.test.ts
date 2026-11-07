import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { DEFAULT_FILE_LIMITS } from '../../src/exports/shared.js'
import { type App, countDocs, createForm, field, section, startApp } from './helpers.js'

let app: App

beforeAll(async () => {
  app = await startApp({ plugin: { attachments: { maxTotalSize: 3 * 1024 * 1024 }, fields: { fileUpload: true } } })
})

afterAll(async () => {
  await app?.payload.destroy()
})

function textFile(name: string, size = 64, type = 'text/plain'): File {
  return new File([new Uint8Array(size).fill(97)], name, { type })
}

async function post(slug: string, entries: Array<[string, File | string]>, ip = '192.0.2.60') {
  const body = new FormData()
  for (const [key, value] of entries) {
    body.append(key, value)
  }
  const res = await app.fetch(`/custom-forms/submit/${slug}`, { body, headers: { 'cf-connecting-ip': ip }, method: 'POST' })
  return { body: (await res.json()) as Record<string, any>, status: res.status }
}

describe('attachments', () => {
  test('allowed files are stored, linked and private', async () => {
    const form = await createForm(app, {
      sections: [section('s', [field('text', 'name'), field('fileUpload', 'docs', { maxFiles: 2, words: { label: 'Documents' } })])],
    })
    const { body, status } = await post(form.slug, [
      ['name', 'Ana'],
      ['docs', textFile('one.txt')],
      ['docs', textFile('two.csv', 32, 'text/csv')],
    ])
    expect(status).toBe(200)
    const sub = (await app.payload.findByID({ id: body.submissionId, collection: 'custom-form-submissions' as never, depth: 0, overrideAccess: true })) as Record<string, any>
    expect(sub.attachments).toHaveLength(2)
    expect(sub.answers.docs.filenames).toEqual(['one.txt', 'two.csv'])
    expect(sub.snapshot.find((r: { fieldKey: string }) => r.fieldKey === 'docs')).toMatchObject({ label: 'Documents', value: 'one.txt, two.csv' })
    for (const id of sub.attachments) {
      const file = (await app.payload.findByID({ id, collection: 'custom-form-attachments' as never, depth: 0, overrideAccess: true })) as Record<string, any>
      expect(file).toMatchObject({ fieldKey: 'docs', fieldLabel: 'Documents', form: form.id, submission: sub.id })
      // Anonymous reads of the record and of the file itself are refused.
      expect((await app.fetch(`/custom-form-attachments/${id}`)).status).toBe(403)
      expect((await app.fetch(`/custom-form-attachments/file/${encodeURIComponent(file.filename)}`)).status).toBe(403)
    }
  })

  test('wrong type, size, count or total creates no attachment', async () => {
    const form = await createForm(app, {
      sections: [
        section('s', [
          field('fileUpload', 'one', { maxFileSizeMB: 1, mimeTypes: ['text/plain'], words: { label: 'One' } }),
          field('fileUpload', 'two', { maxFiles: 2, words: { label: 'Two' } }),
        ]),
      ],
      wording: { fileRejected: 'File refused: {{label}}' },
    })
    const before = await countDocs(app, 'custom-form-attachments')
    const cases: Array<[string, Array<[string, File]>, string]> = [
      ['type', [['one', textFile('a.pdf', 10, 'application/pdf')]], 'one'],
      ['size', [['one', textFile('big.txt', 1024 * 1024 + 1)]], 'one'],
      ['count', [['two', textFile('a.txt')], ['two', textFile('b.txt')], ['two', textFile('c.txt')]], 'two'],
      ['total', [['one', textFile('a.txt', 1024 * 1024)], ['two', textFile('b.txt', 1536 * 1024)], ['two', textFile('c.txt', 1024 * 1024)]], 'two'],
    ]
    for (const [name, entries, key] of cases) {
      const { body, status } = await post(form.slug, entries, `192.0.2.${70 + cases.findIndex((c) => c[0] === name)}`)
      expect(status, name).toBe(400)
      expect(body.fieldErrors, name).toEqual({ [key]: `File refused: ${key === 'one' ? 'One' : 'Two'}` })
    }
    expect(await countDocs(app, 'custom-form-attachments')).toBe(before)
    expect(await countDocs(app, 'custom-form-submissions')).toBe(1)
    // This app lowers the total to 3 MB; the default is 25 MB per submission, 10 MB per file.
    expect(DEFAULT_FILE_LIMITS.maxTotalSize).toBe(25 * 1024 * 1024)
    expect(DEFAULT_FILE_LIMITS.maxFileSize).toBe(10 * 1024 * 1024)
  })

  test('files are removed when the submission fails', async () => {
    const form = await createForm(app, {
      sections: [section('s', [field('fileUpload', 'docs', { maxFiles: 2 })])],
      wording: { genericError: 'Generic words.' },
    })
    const before = await countDocs(app, 'custom-form-attachments')
    const realCreate = app.payload.create.bind(app.payload)
    let attachmentsCreated = 0
    const spy = vi.spyOn(app.payload, 'create').mockImplementation(async (args: any) => {
      if (args.collection === 'custom-form-submissions') {
        throw new Error('database is down')
      }
      const doc = await realCreate(args)
      if (args.collection === 'custom-form-attachments') {
        attachmentsCreated += 1
      }
      return doc
    })
    try {
      const { body, status } = await post(form.slug, [['docs', textFile('a.txt')], ['docs', textFile('b.txt')]], '192.0.2.90')
      expect(status).toBe(500)
      expect(body).toEqual({ message: 'Generic words.', ok: false })
    } finally {
      spy.mockRestore()
    }
    expect(attachmentsCreated).toBe(2)
    expect(await countDocs(app, 'custom-form-attachments')).toBe(before)
  })
})
