import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { DEFAULT_WORDS, WORD_KEYS } from '../../src/exports/shared.js'
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
      field('radio', 'colour', { options: [{ label: 'Red', value: 'red' }] }),
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
})
