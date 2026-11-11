import { sql } from '@payloadcms/db-sqlite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { DEFAULT_WORDS, type FormLike, initialAnswers, WORD_KEYS } from '../../src/exports/shared.js'
import { getPublicForm } from '../../src/index.js'
import { type App, createForm, field, saveError, section, startApp } from './helpers.js'

let app: App

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app?.payload.destroy()
})

type Doc = Record<string, any>

async function read(id: number | string, locale?: 'en' | 'es'): Promise<Doc> {
  return (await app.payload.findByID({ id, collection: 'custom-forms' as never, depth: 0, locale, overrideAccess: true })) as Doc
}

describe('form save', () => {
  test('form with two sections saves and publishes', async () => {
    const form = await createForm(app, {
      sections: [section('first', [field('text', 'name')]), section('second', [field('text', 'city')])],
    })
    const doc = await read(form.id)
    expect(doc._status).toBe('published')
    expect(doc.sections.map((s: Doc) => s.key)).toEqual(['first', 'second'])
    expect(doc.sections.map((s: Doc) => s.fields.map((f: Doc) => `${f.blockType}:${f.fieldKey}`))).toEqual([
      ['text:name'],
      ['text:city'],
    ])
  })

  test('every built-in field type saves', async () => {
    const blocks = [
      { blockType: 'heading', heading: 'About you', level: 'h3' },
      { blockType: 'helpText', body: 'A few questions.' },
      field('text', 'name', { maxLength: 80, minLength: 2 }),
      field('email', 'email'),
      field('textarea', 'message', { maxLength: 2000 }),
      field('number', 'budget', { max: 100000, min: 0 }),
      field('date', 'start', { maxDate: '2027-12-31', minDate: '2026-01-01' }),
      field('select', 'size', { options: [{ label: 'Small', value: 'small' }, { label: 'Large', value: 'large' }] }),
      field('radio', 'colour', { options: [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }] }),
      field('checkbox', 'agree', { defaultValue: true }),
      field('checkboxGroup', 'extras', { options: [{ label: 'Gift wrap', value: 'wrap' }] }),
      field('fileUpload', 'files', { maxFiles: 2, mimeTypes: ['application/pdf', 'text/plain'] }),
    ]
    const form = await createForm(app, { sections: [section('all', blocks as never)] })
    const doc = await read(form.id)
    expect(doc.sections[0].fields.map((f: Doc) => f.blockType)).toEqual([
      'heading',
      'helpText',
      'text',
      'email',
      'textarea',
      'number',
      'date',
      'select',
      'radio',
      'checkbox',
      'checkboxGroup',
      'fileUpload',
    ])
    expect(doc.sections[0].fields[11]).toMatchObject({ maxFiles: 2, mimeTypes: ['application/pdf', 'text/plain'] })
  })

  test('inputs are optional unless required is ticked', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'nickname'), field('text', 'name', { required: true })])] })
    const doc = await read(form.id)
    expect(doc.sections[0].fields[0].required).toBe(false)
    expect(doc.sections[0].fields[1].required).toBe(true)
  })

  test('new form starts with default and option words', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    const doc = await read(form.id)
    for (const key of WORD_KEYS) {
      // The dev app sets words: { send: 'Send now' } in the plugin options.
      expect(doc.wording[key], key).toBe(key === 'send' ? 'Send now' : DEFAULT_WORDS[key])
    }
  })

  test('words are localized when the app has locales', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    await app.payload.update({ id: form.id, collection: 'custom-forms' as never, data: { wording: { send: 'Send' } } as never, locale: 'en', overrideAccess: true })
    // Translating means filling the required words of the other locale too (title, labels).
    const en = await read(form.id, 'en')
    en.sections[0].fields[0].words.label = 'Nombre'
    await app.payload.update({
      id: form.id,
      collection: 'custom-forms' as never,
      data: { sections: en.sections, title: 'Formulario', wording: { send: 'Enviar' } } as never,
      locale: 'es',
      overrideAccess: true,
    })
    expect((await read(form.id, 'en')).wording.send).toBe('Send')
    expect((await read(form.id, 'es')).wording.send).toBe('Enviar')
    expect((await read(form.id, 'es')).sections[0].fields[0].words.label).toBe('Nombre')
    expect((await read(form.id, 'en')).sections[0].fields[0].words.label).toBe('name')
  })

  test('keys are normalised to kebab-case', async () => {
    const form = await createForm(app, {
      sections: [
        section(' First Part ', [field('text', ' Project Type ')]),
        section('second', [field('text', 'other')], {
          visibilityRules: { rows: [{ fieldKey: 'Project Type', operator: 'hasValue' }] },
        }),
      ],
    })
    const doc = await read(form.id)
    expect(doc.sections[0].key).toBe('first-part')
    expect(doc.sections[0].fields[0].fieldKey).toBe('project-type')
    expect(doc.sections[1].visibilityRules.rows[0].fieldKey).toBe('project-type')
  })

  test('missing rule keys and duplicate keys are rejected', async () => {
    const missing = await saveError(
      createForm(app, {
        sections: [section('s', [field('text', 'name', { visibilityRules: { rows: [{ fieldKey: 'ghost', operator: 'hasValue' }] } })])],
      }),
    )
    expect(missing).toContain('"ghost"')
    const duplicate = await saveError(
      createForm(app, { sections: [section('a', [field('text', 'name')]), section('b', [field('email', 'Name')])] }),
    )
    expect(duplicate).toContain('Two fields use the key "name"')
    const target = await saveError(
      createForm(app, {
        presentationMode: 'steps',
        sections: [section('a', [field('text', 'name')], { nextStepRules: [{ rows: [], targetSectionKey: 'nowhere' }] })],
      }),
    )
    expect(target).toContain('"nowhere"')
  })

  test('next-step loops are rejected', async () => {
    const message = await saveError(
      createForm(app, {
        presentationMode: 'steps',
        sections: [
          section('a', [field('text', 'x')], { nextStepRules: [{ rows: [], targetSectionKey: 'b' }] }),
          section('b', [field('text', 'y')], { nextStepRules: [{ rows: [], targetSectionKey: 'a' }] }),
        ],
      }),
    )
    expect(message).toContain('loop: a → b → a')
  })

  test('field tokens in email addresses are rejected', async () => {
    for (const to of ['{{email}}', 'team@example.com, {{other}}']) {
      const message = await saveError(
        createForm(app, {
          delivery: { emails: [{ kind: 'team', label: 'Team', to }] },
          sections: [section('s', [field('email', 'email'), field('text', 'other')])],
        }),
      )
      expect(message, to).toContain('use a visitor copy instead')
    }
    const notEmail = await saveError(
      createForm(app, {
        delivery: { emails: [{ kind: 'visitor', label: 'Copy', visitorField: 'other' }] },
        sections: [section('s', [field('email', 'email'), field('text', 'other')])],
      }),
    )
    expect(notEmail).toContain('needs the key of an email field')
  })

  test('uploads without storing and http webhooks are rejected', async () => {
    const upload = await saveError(
      createForm(app, { delivery: { store: false }, sections: [section('s', [field('fileUpload', 'cv')])] }),
    )
    expect(upload).toContain('"cv"')
    const hook = await saveError(
      createForm(app, {
        delivery: { webhooks: [{ label: 'Hook', url: 'http://hooks.example.com/in' }] },
        sections: [section('s', [field('text', 'name')])],
      }),
    )
    expect(hook).toContain('http://hooks.example.com/in')
  })

  test('reserved keys are rejected', async () => {
    for (const key of ['_hp', 'cf-turnstile-response']) {
      const message = await saveError(createForm(app, { sections: [section('s', [field('text', key)])] }))
      expect(message, key).toContain(`"${key}" is reserved`)
    }
  })

  test('radio and select need at least two typed choices', async () => {
    const one = [{ label: 'Red', value: 'red' }]
    const two = [...one, { label: 'Blue', value: 'blue' }]
    for (const type of ['radio', 'select']) {
      const message = await saveError(createForm(app, { sections: [section('s', [field(type, 'colour', { label: 'Colour', options: one })])] }))
      expect(message, type).toContain(`Colour: a ${type} needs at least 2 choices.`)
      const none = await saveError(createForm(app, { sections: [section('s', [field(type, 'colour', { options: [] })])] }))
      expect(none, type).toContain(`colour: a ${type} needs at least 2 choices.`)
      const form = await createForm(app, { sections: [section('s', [field(type, 'colour', { label: 'Colour', options: two })])] })
      expect((await read(form.id)).sections[0].fields[0].options.map((o: Doc) => o.value), type).toEqual(['red', 'blue'])
    }
  })

  test('radio and select refuse a single picked item', async () => {
    const topic = (label: string) =>
      app.payload.create({
        collection: 'topics' as never,
        data: { slug: `${label.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`, _status: 'published', label } as never,
        overrideAccess: true,
      }) as Promise<{ id: number }>
    const first = await topic('Cameras')
    const pick = (...items: { id: number }[]) => items.map((t) => ({ relationTo: 'topics', value: t.id }))
    // Only one published item in the collection: an empty pick still saves.
    expect((await app.payload.count({ collection: 'topics' as never, overrideAccess: true, where: { _status: { equals: 'published' } } })).totalDocs).toBe(1)
    for (const type of ['radio', 'select']) {
      const empty = await createForm(app, { sections: [section('s', [field(type, 'need', { optionsFrom: 'topics', sourceItems: [] })])] })
      expect((await read(empty.id)).sections[0].fields[0].sourceItems, type).toEqual([])
      const message = await saveError(
        createForm(app, { sections: [section('s', [field(type, 'need', { label: 'Topic', optionsFrom: 'topics', sourceItems: pick(first) })])] }),
      )
      expect(message, type).toContain(`Topic: a ${type} needs at least 2 choices.`)
    }
    const second = await topic('Tripods')
    for (const type of ['radio', 'select']) {
      const form = await createForm(app, { sections: [section('s', [field(type, 'need', { optionsFrom: 'topics', sourceItems: pick(first, second) })])] })
      expect((await read(form.id)).sections[0].fields[0].sourceItems, type).toHaveLength(2)
    }
  })

  test('a checkbox group may have one option', async () => {
    const form = await createForm(app, {
      sections: [section('s', [field('checkboxGroup', 'extras', { options: [{ label: 'Gift wrap', value: 'wrap' }] })])],
    })
    expect((await read(form.id)).sections[0].fields[0].options.map((o: Doc) => o.value)).toEqual(['wrap'])
  })

  test('new forms default to step by step', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'name')])] })
    expect((await read(form.id)).presentationMode).toBe('steps')
    let options: unknown
    const visit = (fields: Doc[]) => {
      for (const f of fields) {
        if (f.name === 'presentationMode') {
          options = f.options
        }
        for (const tab of f.tabs || []) {
          visit(tab.fields)
        }
        if (Array.isArray(f.fields)) {
          visit(f.fields)
        }
      }
    }
    visit(app.payload.collections['custom-forms' as never].config.fields as never)
    expect(options).toEqual([
      { label: 'Step by step', value: 'steps' },
      { label: 'Single page', value: 'singlePage' },
    ])
  })

  test('saved single-page forms keep their mode', async () => {
    const form = await createForm(app, { presentationMode: 'singlePage', sections: [section('s', [field('text', 'name')])] })
    await app.payload.update({ id: form.id, collection: 'custom-forms' as never, data: { title: 'Renamed' } as never, overrideAccess: true })
    const doc = await read(form.id)
    expect(doc.title).toBe('Renamed')
    expect(doc.presentationMode).toBe('singlePage')
    expect((await getPublicForm(app.payload, form.slug))!.presentationMode).toBe('singlePage')
  })

  /** Saves the form's sections again through the Local API, every section and question row id kept. */
  async function resave(id: number | string, edit: (sections: Doc[]) => void = () => {}): Promise<Doc> {
    const doc = await read(id)
    edit(doc.sections)
    for (const s of doc.sections) {
      expect(s.id).toBeTruthy()
      for (const f of s.fields) {
        expect(f.id).toBeTruthy()
      }
    }
    await app.payload.update({ id, collection: 'custom-forms' as never, data: { sections: doc.sections } as never, overrideAccess: true })
    return read(id)
  }

  /**
   * Writes a question row as a 0.3.0 row reads after the migration: no lock (NULL), in the block
   * table and in its versions table (Payload's update starts from the latest version; the
   * migration adds the NULL column to both).
   */
  async function write030Row(blockType: string, rowId: string, prefillParam: null | string): Promise<void> {
    const db = app.payload.db as unknown as { drizzle: { run: (query: unknown) => Promise<unknown> } }
    const main = sql.identifier(`custom_forms_blocks_${blockType}`)
    const versions = sql.identifier(`_custom_forms_v_blocks_${blockType}`)
    await db.drizzle.run(sql`UPDATE ${main} SET prefill_from_key = NULL, prefill_param = ${prefillParam} WHERE id = ${rowId}`)
    await db.drizzle.run(sql`UPDATE ${versions} SET prefill_from_key = NULL, prefill_param = ${prefillParam} WHERE _uuid = ${rowId}`)
  }

  test('new questions are locked and prefill by their key', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', ' Full Name ')])] })
    const question = (await read(form.id)).sections[0].fields[0]
    expect(question.fieldKey).toBe('full-name')
    expect(question.prefillFromKey).toBe(true)
    expect(question.prefillParam).toBe('full-name')
    const doc = await read(form.id)
    expect(initialAnswers(doc as FormLike, '?full-name=Ana')['full-name']).toBe('Ana')
  })

  test('new checkbox questions start unlocked', async () => {
    const form = await createForm(app, { sections: [section('s', [field('checkbox', 'consent')])] })
    const doc = await read(form.id)
    expect(doc.sections[0].fields[0].prefillFromKey).toBe(false)
    expect(doc.sections[0].fields[0].prefillParam ?? '').toBe('')
    expect(initialAnswers(doc as FormLike, '?consent=yes').consent).toBe(false)
    const locked = await resave(form.id, (sections) => {
      sections[0].fields[0].prefillFromKey = true
    })
    expect(locked.sections[0].fields[0].prefillFromKey).toBe(true)
    expect(locked.sections[0].fields[0].prefillParam).toBe('consent')
  })

  test('a locked prefill parameter follows the key', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'need')])] })
    expect((await read(form.id)).sections[0].fields[0].prefillParam).toBe('need')
    const after = await resave(form.id, (sections) => {
      sections[0].fields[0].fieldKey = 'Topic'
    })
    expect(after.sections[0].fields[0].fieldKey).toBe('topic')
    expect(after.sections[0].fields[0].prefillFromKey).toBe(true)
    expect(after.sections[0].fields[0].prefillParam).toBe('topic')
  })

  test('an unlocked prefill parameter is kept', async () => {
    const form = await createForm(app, {
      sections: [
        section('s', [
          field('text', 'need', { prefillFromKey: false, prefillParam: ' ref ' }),
          field('text', 'other', { prefillFromKey: false }),
        ]),
      ],
    })
    const doc = await read(form.id)
    expect(doc.sections[0].fields[0].prefillParam).toBe('ref')
    expect(doc.sections[0].fields[1].prefillParam ?? '').toBe('')
    const after = await resave(form.id, (sections) => {
      sections[0].fields[0].fieldKey = 'topic'
      sections[0].fields[1].fieldKey = 'another'
    })
    expect(after.sections[0].fields.map((f: Doc) => [f.fieldKey, f.prefillFromKey, f.prefillParam ?? ''])).toEqual([
      ['topic', false, 'ref'],
      ['another', false, ''],
    ])
  })

  test('0.3.0 questions without a parameter stay unprefilled', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'name', { defaultValue: 'Someone' })])] })
    const rowId = (await read(form.id)).sections[0].fields[0].id
    await write030Row('text', rowId, null)
    const before = await read(form.id)
    expect(before.sections[0].fields[0].prefillFromKey).toBeNull()
    expect(before.sections[0].fields[0].prefillParam ?? '').toBe('')
    // Resend every section and question row id, without the lock or the parameter.
    const after = await resave(form.id, (sections) => {
      delete sections[0].fields[0].prefillFromKey
      delete sections[0].fields[0].prefillParam
      sections[0].title = 'Renamed'
    })
    expect(after.sections[0].title).toBe('Renamed')
    expect(after.sections[0].fields[0].id).toBe(rowId)
    expect(after.sections[0].fields[0].prefillFromKey).toBeNull()
    expect(after.sections[0].fields[0].prefillParam ?? '').toBe('')
    expect(initialAnswers(after as FormLike, '?name=x').name).toBe('Someone')
  })

  test('0.3.0 questions keep their parameter', async () => {
    const form = await createForm(app, { sections: [section('s', [field('text', 'topic')])] })
    const rowId = (await read(form.id)).sections[0].fields[0].id
    await write030Row('text', rowId, 'need')
    // As the admin sends it: every row id, the null lock and the stored parameter.
    const after = await resave(form.id, (sections) => {
      expect(sections[0].fields[0].prefillFromKey).toBeNull()
      sections[0].title = 'Renamed'
    })
    expect(after.sections[0].fields[0].fieldKey).toBe('topic')
    expect(after.sections[0].fields[0].prefillFromKey).toBeNull()
    expect(after.sections[0].fields[0].prefillParam).toBe('need')
    // And without the two fields: the stored values still win.
    const again = await resave(form.id, (sections) => {
      delete sections[0].fields[0].prefillFromKey
      delete sections[0].fields[0].prefillParam
    })
    expect(again.sections[0].fields[0].prefillFromKey).toBeNull()
    expect(again.sections[0].fields[0].prefillParam).toBe('need')
    expect(initialAnswers(again as FormLike, '?need=x').topic).toBe('x')
  })
})
