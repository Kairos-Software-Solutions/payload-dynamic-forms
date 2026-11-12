import type { Block, CollectionConfig, Config, Field } from 'payload'

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { LEVEL_CHECKBOX_STYLE } from '../src/collections/adminStyle.js'
import { DEFAULT_WORDS, OPERATORS, WORD_KEYS } from '../src/exports/shared.js'
import { formBlock, formsPlugin, resolveOptions } from '../src/index.js'
import fieldPaths030 from './fixtures/field-paths-0.3.0.json' with { type: 'json' }

function baseConfig(): Config {
  return {
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    db: {} as never,
    secret: 'test',
  }
}

function collection(config: Config, slug: string): CollectionConfig {
  const found = config.collections!.find((c) => c.slug === slug)
  if (!found) {
    throw new Error(`no collection ${slug}`)
  }
  return found
}

/** Every field, walking rows, tabs, groups, arrays, collapsibles and blocks. */
function walk(fields: Field[], visit: (field: Field, path: string) => void, prefix = ''): void {
  for (const field of fields) {
    const name = 'name' in field ? field.name : ''
    const path = name ? (prefix ? `${prefix}.${name}` : name) : prefix
    visit(field, path)
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        walk(tab.fields, visit, 'name' in tab && tab.name ? `${path}.${tab.name}` : path)
      }
    } else if (field.type === 'blocks') {
      for (const block of field.blocks) {
        walk(block.fields, visit, `${path}.${block.slug}`)
      }
    } else if ('fields' in field && Array.isArray(field.fields)) {
      walk(field.fields, visit, path)
    }
  }
}

function sectionBlocks(config: Config, slug = 'custom-forms'): Block[] {
  let blocks: Block[] = []
  walk(collection(config, slug).fields, (field, path) => {
    if (field.type === 'blocks' && path === 'sections.fields') {
      blocks = field.blocks
    }
  })
  return blocks
}

/** A block's fields with rows and collapsibles opened (groups and arrays stay whole). */
function openFields(fields: Field[]): Field[] {
  return fields.flatMap((field) => (field.type === 'row' || field.type === 'collapsible' ? openFields(field.fields) : [field]))
}

/** Names of the stored (non-ui) fields at a block's top level, rows and collapsibles opened. */
function dataNames(fields: Field[]): string[] {
  return openFields(fields)
    .filter((field) => field.type !== 'ui' && 'name' in field)
    .map((field) => (field as { name: string }).name)
}

/** Every data path (groups and arrays add a segment; rows, collapsibles and ui fields don't). */
function dataPaths(fields: Field[], prefix = ''): string[] {
  const out: string[] = []
  for (const field of openFields(fields)) {
    if (field.type === 'ui' || !('name' in field)) {
      continue
    }
    const path = prefix ? `${prefix}.${field.name}` : field.name
    out.push(path)
    if ('fields' in field && Array.isArray(field.fields)) {
      out.push(...dataPaths(field.fields, path))
    }
  }
  return out
}

/** The first field with this name at a block's top level (rows and collapsibles opened). */
function named<T = Field>(fields: Field[], name: string): T {
  const found = openFields(fields).find((field) => 'name' in field && field.name === name)
  if (!found) {
    throw new Error(`no field ${name}`)
  }
  return found as T
}

const INPUT_TYPES = ['text', 'email', 'textarea', 'number', 'date', 'select', 'radio', 'checkbox', 'checkboxGroup', 'fileUpload']

function allBlocks(): Block[] {
  return sectionBlocks(formsPlugin({ fields: { fileUpload: true } })(baseConfig()))
}

function inputBlocks(): Block[] {
  const blocks = allBlocks().filter((b) => INPUT_TYPES.includes(b.slug))
  expect(blocks.map((b) => b.slug).sort()).toEqual([...INPUT_TYPES].sort())
  return blocks
}

/** The rule rows' fields of a rule group or next-step rule array, by its path in the forms collection. */
function fieldsAt(config: Config, wanted: string): Field[] {
  let found: Field[] | undefined
  walk(collection(config, 'custom-forms').fields, (field, path) => {
    if (path === wanted && 'name' in field && 'fields' in field && Array.isArray(field.fields)) {
      found = field.fields
    }
  })
  if (!found) {
    throw new Error(`nothing at ${wanted}`)
  }
  return found
}

describe('plugin config', () => {
  test('defaults add the three collections and endpoints', () => {
    const config = formsPlugin({})(baseConfig())
    expect(config.collections!.map((c) => c.slug)).toEqual([
      'posts',
      'custom-forms',
      'custom-form-submissions',
      'custom-form-attachments',
    ])
    const forms = collection(config, 'custom-forms')
    const subs = collection(config, 'custom-form-submissions')
    const endpoints = (c: CollectionConfig) => (c.endpoints || []).map((e) => `${e.method} ${e.path}`)
    expect(endpoints(forms)).toEqual(['post /submit/:slug', 'get /public/:slug'])
    expect(endpoints(subs)).toEqual(['post /:id/resend'])
    expect(collection(config, 'custom-form-attachments').upload).toBeTruthy()
  })

  test("keeps the app's collections, endpoints, globals and onInit", async () => {
    const onInit = vi.fn()
    const handler = () => Response.json({})
    const input: Config = {
      ...baseConfig(),
      endpoints: [{ handler, method: 'get', path: '/hello' }],
      globals: [{ slug: 'settings', fields: [{ name: 'siteName', type: 'text' }] }],
      onInit,
    }
    const config = formsPlugin({})(input)
    expect(config.collections!.map((c) => c.slug)).toContain('posts')
    expect(config.endpoints).toEqual([{ handler, method: 'get', path: '/hello' }])
    expect(config.globals!.map((g) => g.slug)).toEqual(['settings'])
    await config.onInit!({} as never)
    expect(onInit).toHaveBeenCalledTimes(1)
  })

  test('enabled false returns the config unchanged', () => {
    const input = baseConfig()
    const copy = structuredClone({ ...input, db: undefined })
    const config = formsPlugin({ enabled: false, fields: { fileUpload: true } })(input)
    expect({ ...config, db: undefined }).toStrictEqual(copy)
    expect(config).toBe(input)
  })

  test('renamed slugs are used by every relationship', () => {
    const config = formsPlugin({ slugs: { attachments: 'files-x', forms: 'forms-x', submissions: 'subs-x' } })(baseConfig())
    expect(config.collections!.map((c) => c.slug)).toEqual(['posts', 'forms-x', 'subs-x', 'files-x'])
    const targets: string[] = []
    for (const slug of ['forms-x', 'subs-x', 'files-x']) {
      walk(collection(config, slug).fields, (field, path) => {
        if (field.type === 'relationship' || field.type === 'upload') {
          targets.push(`${slug}:${path}->${String(field.relationTo)}`)
        }
      })
    }
    expect(targets.sort()).toEqual(
      ['files-x:form->forms-x', 'files-x:submission->subs-x', 'subs-x:attachments->files-x', 'subs-x:form->forms-x'].sort(),
    )
    expect(JSON.stringify(config.collections!.map((c) => c.slug))).not.toContain('custom-')
  })

  test('field overrides receive defaultFields', () => {
    let received: Field[] = []
    const config = formsPlugin({
      formOverrides: {
        fields: ({ defaultFields }) => {
          received = defaultFields
          return [...defaultFields, { name: 'extra', type: 'text' }]
        },
      },
    })(baseConfig())
    const fields = collection(config, 'custom-forms').fields
    expect(received.length).toBeGreaterThan(2)
    expect(fields.slice(0, received.length)).toEqual(received)
    expect(fields.at(-1)).toEqual({ name: 'extra', type: 'text' })
  })

  test('override access replaces the default', () => {
    const read = () => true
    const config = formsPlugin({ submissionOverrides: { access: { read } } })(baseConfig())
    const subs = collection(config, 'custom-form-submissions')
    expect(subs.access!.read).toBe(read)
    // Other defaults stay.
    expect(subs.access!.create!({} as never)).toBe(false)
  })

  test('fields registry turns built-in types on and off', () => {
    const defaults = sectionBlocks(formsPlugin({})(baseConfig())).map((b) => b.slug)
    expect(defaults).toEqual(['heading', 'helpText', 'text', 'email', 'textarea', 'number', 'date', 'select', 'radio', 'checkbox', 'checkboxGroup'])
    const slugs = sectionBlocks(formsPlugin({ fields: { date: false, fileUpload: true } })(baseConfig())).map((b) => b.slug)
    expect(slugs).toContain('fileUpload')
    expect(slugs).not.toContain('date')
    expect(slugs).toEqual(defaults.filter((s) => s !== 'date').concat('fileUpload'))
  })

  test('partial block is deep-merged into the built-in', () => {
    const builtIn = sectionBlocks(formsPlugin({})(baseConfig())).find((b) => b.slug === 'text')!
    const merged = sectionBlocks(formsPlugin({ fields: { text: { labels: { singular: 'Short answer' } as never } } })(baseConfig())).find(
      (b) => b.slug === 'text',
    )!
    expect(merged.labels!.singular).toBe('Short answer')
    expect(merged.labels!.plural).toBe(builtIn.labels!.plural)
    expect(JSON.stringify(merged.fields)).toBe(JSON.stringify(builtIn.fields))
  })

  test('formBlock picks one form and holds no words', () => {
    const block = formBlock()
    expect(block.slug).toBe('formBlock')
    expect(block.fields).toEqual([{ name: 'form', type: 'relationship', relationTo: 'custom-forms', required: true }])
    expect(formBlock({ formsSlug: 'forms-x' }).fields[0]).toMatchObject({ relationTo: 'forms-x' })
  })

  test('every rule row uses the shared operator list', () => {
    const config = formsPlugin({ fields: { fileUpload: true } })(baseConfig())
    const operatorFields: string[] = []
    walk(collection(config, 'custom-forms').fields, (field, path) => {
      if ('name' in field && field.name === 'operator') {
        operatorFields.push(path)
        expect(field.type).toBe('select')
        expect((field as { options: unknown }).options, path).toBe(OPERATORS)
      }
    })
    // Section rules, next-step rules and the rules of all 10 input blocks.
    expect(operatorFields.length).toBe(2 + 10)
  })

  test('forms keep drafts and 20 versions without scheduled publish', () => {
    const forms = collection(formsPlugin({})(baseConfig()), 'custom-forms')
    expect(forms.versions).toEqual({ drafts: true, maxPerDoc: 20 })
    expect(JSON.stringify(forms.versions)).not.toContain('schedulePublish')
  })

  test('email subject and body are localized', () => {
    let rowFields: Field[] | undefined
    walk(collection(formsPlugin({})(baseConfig()), 'custom-forms').fields, (field, path) => {
      if (field.type === 'array' && path === 'delivery.emails') {
        rowFields = field.fields
      }
    })
    expect(rowFields).toBeDefined()
    const localized = new Map<string, boolean>()
    walk(rowFields!, (field, path) => {
      if ('name' in field && path === field.name) {
        localized.set(field.name, Boolean((field as { localized?: boolean }).localized))
      }
    })
    expect([...localized.keys()].sort()).toEqual(
      ['bcc', 'body', 'cc', 'enabled', 'from', 'kind', 'label', 'replyToField', 'subject', 'to', 'visitorField'].sort(),
    )
    for (const [name, isLocalized] of localized) {
      expect(isLocalized, name).toBe(name === 'subject' || name === 'body')
    }
  })

  test('secretsInAdmin false leaves the secret fields out', () => {
    const rowFields = (config: Config): Field[] => {
      let found: Field[] | undefined
      walk(collection(config, 'custom-forms').fields, (field, path) => {
        if (field.type === 'array' && path === 'delivery.webhooks') {
          found = field.fields
        }
      })
      expect(found).toBeDefined()
      return found!
    }
    // The row's own fields (rows flattened, nested fields left out).
    const named = (fields: Field[]) => {
      const out = new Map<string, Field>()
      for (const field of fields) {
        for (const leaf of field.type === 'row' ? field.fields : [field]) {
          if ('name' in leaf) {
            out.set(leaf.name, leaf)
          }
        }
      }
      return out
    }

    const off = named(rowFields(formsPlugin({ webhooks: { secretsInAdmin: false } })(baseConfig())))
    expect(off.has('signingSecret')).toBe(false)
    expect(off.has('headers')).toBe(false)
    // The other webhook fields stay.
    expect([...off.keys()]).toEqual(expect.arrayContaining(['label', 'method', 'enabled', 'url', 'payloadMode', 'timeoutMs', 'retries']))

    const isAdmin = vi.fn(() => false)
    const on = named(rowFields(formsPlugin({ access: { isAdmin } })(baseConfig())))
    for (const name of ['signingSecret', 'headers']) {
      const field = on.get(name) as { access?: Record<string, (args: unknown) => boolean> } | undefined
      expect(field, name).toBeDefined()
      for (const op of ['create', 'read', 'update']) {
        const check = field!.access?.[op]
        expect(typeof check, `${name}.${op}`).toBe('function')
        isAdmin.mockReturnValueOnce(false)
        expect(check!({ req: { user: { id: 1 } } }), `${name}.${op} non-admin`).toBe(false)
        isAdmin.mockReturnValueOnce(true)
        expect(check!({ req: { user: { id: 1 } } }), `${name}.${op} admin`).toBe(true)
      }
    }
  })

  test("attachments can use the app's upload collection", () => {
    const input: Config = {
      ...baseConfig(),
      collections: [
        ...baseConfig().collections!,
        { slug: 'private-files', access: { read: () => false }, fields: [{ name: 'note', type: 'text' }], upload: true },
      ],
    }
    const config = formsPlugin({ attachments: { collection: 'private-files' } })(input)
    expect(config.collections!.map((c) => c.slug)).toEqual(['posts', 'private-files', 'custom-forms', 'custom-form-submissions'])
    const files = collection(config, 'private-files')
    expect(files.fields.map((f) => ('name' in f ? f.name : ''))).toEqual(['note', 'form', 'submission', 'fieldKey', 'fieldLabel'])
    let target = ''
    walk(collection(config, 'custom-form-submissions').fields, (field) => {
      if ('name' in field && field.name === 'attachments' && field.type === 'relationship') {
        target = String(field.relationTo)
      }
    })
    expect(target).toBe('private-files')
    // Not an upload collection (or missing): the config build fails.
    expect(() => formsPlugin({ attachments: { collection: 'posts' } })(baseConfig())).toThrow(/upload collection/)
    expect(() => formsPlugin({ attachments: { collection: 'nope' } })(baseConfig())).toThrow(/upload collection/)
  })

  test('rules come last in every built-in input block', () => {
    for (const block of inputBlocks()) {
      const names = dataNames(block.fields)
      expect(names.at(-1), block.slug).toBe('visibilityRules')
      expect(names.slice(0, 3), block.slug).toEqual(['fieldKey', 'width', 'required'])
      expect(names.indexOf('defaultValue'), block.slug).toBeLessThan(names.indexOf('prefillParam'))
      if (block.slug === 'radio' || block.slug === 'select') {
        for (const later of ['defaultValue', 'prefillParam', 'visibilityRules']) {
          expect(names.indexOf('options'), `${block.slug} options before ${later}`).toBeLessThan(names.indexOf(later))
        }
      }
      // The type's own fields sit between the words and the default row.
      const own = names.filter((n) => !['defaultValue', 'fieldKey', 'prefillFromKey', 'prefillParam', 'required', 'visibilityRules', 'width', 'words'].includes(n))
      for (const name of own) {
        expect(names.indexOf(name), `${block.slug}.${name}`).toBeGreaterThan(names.indexOf('words'))
        expect(names.indexOf(name), `${block.slug}.${name}`).toBeLessThan(names.indexOf('defaultValue'))
      }
    }
    // Spot check of a type with own fields: text's limits come before the default row.
    const text = inputBlocks().find((b) => b.slug === 'text')!
    expect(dataNames(text.fields)).toEqual([
      'fieldKey',
      'width',
      'required',
      'words',
      'minLength',
      'maxLength',
      'defaultValue',
      'prefillFromKey',
      'prefillParam',
      'visibilityRules',
    ])
  })

  test('app field types put their own fields before the rules', () => {
    const config = formsPlugin({
      fields: { rating: { block: { slug: 'rating', fields: [{ name: 'rating', type: 'number', max: 5, min: 1 }] } } },
    })(baseConfig())
    const block = sectionBlocks(config).find((b) => b.slug === 'rating')!
    expect(block).toBeDefined()
    // Top level: key row, words, then the type's own field, then the default/prefill row, then the rules.
    expect(block.fields.map((f) => ('name' in f ? f.name : f.type))).toEqual(['row', 'collapsible', 'rating', 'row', 'visibilityRules'])
    const names = dataNames(block.fields)
    expect(names.slice(0, 5)).toEqual(['fieldKey', 'width', 'required', 'words', 'rating'])
    expect(names.indexOf('rating')).toBeLessThan(names.indexOf('defaultValue'))
    expect(names.indexOf('rating')).toBeLessThan(names.indexOf('prefillParam'))
    expect(names.at(-1)).toBe('visibilityRules')
  })

  test('field names are unchanged from 0.3.0 apart from the listed new fields', () => {
    const before = fieldPaths030 as Record<string, string[]>
    const now: Record<string, string[]> = {}
    for (const block of allBlocks()) {
      now[block.slug] = dataPaths(block.fields).sort()
    }
    expect(Object.keys(now).sort()).toEqual(Object.keys(before).sort())
    for (const [slug, paths] of Object.entries(before)) {
      const missing = paths.filter((p) => !now[slug].includes(p))
      const added = now[slug].filter((p) => !paths.includes(p))
      expect(missing, `${slug} lost`).toEqual([])
      const allowed = slug === 'date' ? ['displayStyle', 'mode', 'prefillFromKey', 'valueFormat'] : INPUT_TYPES.includes(slug) ? ['prefillFromKey'] : []
      expect(added.sort(), `${slug} added`).toEqual(allowed)
    }
  })

  test('default fields match the question type', () => {
    const sources = { products: { collection: 'posts', labelField: 'title', valueField: 'title' } }
    type DefaultField = {
      admin?: { components?: { Field?: { clientProps?: Record<string, unknown>; path: string } | string } }
      localized?: boolean
      type: string
    }
    for (const options of [{ fields: { fileUpload: true } }, { fields: { fileUpload: true }, optionSources: sources }]) {
      const blocks = sectionBlocks(formsPlugin(options as never)(baseConfig())).filter((b) => INPUT_TYPES.includes(b.slug))
      expect(blocks.length).toBe(INPUT_TYPES.length)
      const component = (field: DefaultField) => field.admin?.components?.Field
      for (const block of blocks) {
        const field = named<DefaultField>(block.fields, 'defaultValue')
        const slug = block.slug
        if (slug === 'text' || slug === 'textarea') {
          expect(field.type, slug).toBe('text')
          expect(field.localized, slug).toBe(true)
          expect(component(field), slug).toBeUndefined()
          continue
        }
        expect(field.localized, slug).toBeFalsy()
        if (slug === 'email') {
          expect(field.type).toBe('email')
          expect(component(field)).toBeUndefined()
        } else if (slug === 'number') {
          expect(field.type).toBe('text')
          expect(component(field)).toBe('payload-dynamic-forms/client#NumberDefaultField')
        } else if (slug === 'date') {
          expect(field.type).toBe('text')
          expect(component(field)).toBe('payload-dynamic-forms/client#DateValueField')
        } else if (slug === 'select' || slug === 'radio' || slug === 'checkboxGroup') {
          expect(field.type, slug).toBe('text')
          const config = component(field) as { clientProps?: Record<string, unknown>; path: string }
          expect(config.path, slug).toBe('payload-dynamic-forms/client#DefaultChoiceField')
          expect(Boolean(config.clientProps?.multiple), slug).toBe(slug === 'checkboxGroup')
          if (options.optionSources) {
            expect(config.clientProps?.sources, slug).toEqual({ products: { collection: 'posts', labelField: 'title', valueField: 'title' } })
          } else {
            expect(config.clientProps?.sources, slug).toBeUndefined()
          }
        } else if (slug === 'checkbox') {
          expect(field).toMatchObject({ type: 'checkbox', defaultValue: false })
          expect(component(field)).toBeUndefined()
        } else if (slug === 'fileUpload') {
          expect(field).toMatchObject({ type: 'text', admin: { hidden: true } })
          expect(component(field)).toBeUndefined()
        }
      }
      // Option values, numbers and dates are never localized; option labels stay localized.
      for (const block of blocks) {
        walk(block.fields, (field, p) => {
          if (['displayStyle', 'max', 'maxDate', 'min', 'minDate', 'mode', 'options.value', 'valueFormat'].includes(p)) {
            expect((field as { localized?: boolean }).localized, `${block.slug}.${p}`).toBeFalsy()
          }
          if (p === 'options.label') {
            expect((field as { localized?: boolean }).localized, `${block.slug}.${p}`).toBe(true)
          }
        })
      }
    }
  })

  test('date questions have a mode, a stored format and a display style', () => {
    const date = inputBlocks().find((b) => b.slug === 'date')!
    type Select = {
      admin?: { condition?: (data: unknown, sibling: unknown) => boolean }
      defaultValue: unknown
      label: string
      options: { label: string; value: string }[]
      type: string
    }
    const mode = named<Select>(date.fields, 'mode')
    const valueFormat = named<Select>(date.fields, 'valueFormat')
    const displayStyle = named<Select>(date.fields, 'displayStyle')
    expect(mode.type).toBe('select')
    expect(mode.label).toBe('Asks for')
    expect(mode.options).toEqual([
      { label: 'Date', value: 'dayOnly' },
      { label: 'Date and time', value: 'dayAndTime' },
      { label: 'Time', value: 'timeOnly' },
    ])
    expect(valueFormat.type).toBe('select')
    expect(valueFormat.label).toBe('Stored as')
    expect(valueFormat.options.map((o) => o.value)).toEqual(['local', 'utc'])
    expect(displayStyle.type).toBe('select')
    expect(displayStyle.label).toBe('In emails and messages')
    expect(displayStyle.options.map((o) => o.value)).toEqual(['asStored', 'short', 'medium', 'long'])
    for (const [field, value] of [
      [mode, 'dayOnly'],
      [valueFormat, 'local'],
      [displayStyle, 'asStored'],
    ] as const) {
      expect(typeof field.defaultValue, field.label).toBe('function')
      expect((field.defaultValue as (args: unknown) => unknown)({}), field.label).toBe(value)
    }
    const condition = valueFormat.admin!.condition!
    expect(condition({}, { mode: 'dayAndTime' })).toBe(true)
    for (const other of ['dayOnly', 'timeOnly', null, undefined]) {
      expect(condition({}, { mode: other }), String(other)).toBe(false)
    }
    expect(mode.admin?.condition).toBeUndefined()
    expect(displayStyle.admin?.condition).toBeUndefined()
    const names = dataNames(date.fields)
    for (const setting of ['mode', 'valueFormat', 'displayStyle']) {
      for (const later of ['minDate', 'maxDate', 'defaultValue']) {
        expect(names.indexOf(setting), `${setting} before ${later}`).toBeLessThan(names.indexOf(later))
      }
    }
    expect(names.slice(names.indexOf('mode'), names.indexOf('mode') + 5)).toEqual(['mode', 'valueFormat', 'displayStyle', 'minDate', 'maxDate'])
    // Limits keep their names and labels and check the mode's format.
    type Limit = { label: string; validate: (value: unknown, args: unknown) => string | true }
    const minDate = named<Limit>(date.fields, 'minDate')
    expect(minDate.label).toBe('Earliest')
    expect(named<Limit>(date.fields, 'maxDate').label).toBe('Latest')
    expect(minDate.validate('', { siblingData: {} })).toBe(true)
    expect(minDate.validate('2026-12-01', { siblingData: { mode: null } })).toBe(true)
    expect(minDate.validate('today', { siblingData: { mode: 'dayOnly' } })).toBe(true)
    expect(minDate.validate('12/01/2026', { siblingData: {} })).toMatch(/YYYY-MM-DD/)
    expect(minDate.validate('09:00', { siblingData: { mode: 'timeOnly' } })).toBe(true)
    expect(minDate.validate('today', { siblingData: { mode: 'timeOnly' } })).toMatch(/HH:MM/)
    expect(minDate.validate('2026-12-01T09:00', { siblingData: { mode: 'dayAndTime' } })).toBe(true)
    expect(minDate.validate('2026-12-01', { siblingData: { mode: 'dayAndTime' } })).toMatch(/YYYY-MM-DDTHH:MM/)
  })

  test('rule arrays are labelled Rules and still named rows', () => {
    const config = formsPlugin({})(baseConfig())
    const groups = [
      ...INPUT_TYPES.filter((t) => t !== 'fileUpload').map((t) => fieldsAt(config, `sections.fields.${t}.visibilityRules`)),
      fieldsAt(config, 'sections.visibilityRules'),
      fieldsAt(config, 'sections.nextStepRules'),
    ]
    for (const fields of groups) {
      const rows = named<{ label?: unknown; labels?: unknown; name: string; type: string }>(fields, 'rows')
      expect(rows.type).toBe('array')
      expect(rows.labels).toEqual({ plural: 'Rules', singular: 'Rule' })
      expect(rows.label).toBe('Rules')
    }
  })

  test('rule fields are labelled Field and jumps Jump to section when', () => {
    const config = formsPlugin({})(baseConfig())
    const ruleRows = [
      fieldsAt(config, 'sections.fields.text.visibilityRules.rows'),
      fieldsAt(config, 'sections.visibilityRules.rows'),
      fieldsAt(config, 'sections.nextStepRules.rows'),
    ]
    for (const fields of ruleRows) {
      const key = named<{ label?: unknown; type: string }>(fields, 'fieldKey')
      expect(key.type).toBe('text')
      expect(key.label).toBe('Field')
    }
    let jumps: { admin: { condition: (data: unknown) => boolean; description: string }; label: string; labels: unknown; name: string; type: string } | undefined
    walk(collection(config, 'custom-forms').fields, (field, p) => {
      if (p === 'sections.nextStepRules') {
        jumps = field as never
      }
    })
    expect(jumps).toBeDefined()
    expect(jumps!.name).toBe('nextStepRules')
    expect(jumps!.type).toBe('array')
    expect(jumps!.label).toBe('Jump to section when')
    expect(jumps!.labels).toEqual({ plural: 'Jumps', singular: 'Jump' })
    expect(jumps!.admin.description).toBe('Skips every section in between, even ones whose show rules match.')
    expect(jumps!.admin.condition({ presentationMode: 'steps' })).toBe(true)
    expect(jumps!.admin.condition({ presentationMode: 'singlePage' })).toBe(false)
    const target = named<{ label?: unknown; name: string; type: string }>(fieldsAt(config, 'sections.nextStepRules'), 'targetSectionKey')
    expect(target.name).toBe('targetSectionKey')
    expect(target.type).toBe('text')
    expect(target.label).toBe('Jump to section')
  })

  test('jump skip hint follows the jumps', () => {
    const sections = fieldsAt(formsPlugin({})(baseConfig()), 'sections')
    const names = sections.map((f) => ('name' in f ? f.name : f.type))
    expect(names.indexOf('jumpSkipHint')).toBe(names.indexOf('nextStepRules') + 1)
    const hint = sections[names.indexOf('jumpSkipHint')] as { admin: { components: { Field: string }; condition: (data: unknown) => boolean }; type: string }
    expect(hint.type).toBe('ui')
    expect(hint.admin.components.Field).toBe('payload-dynamic-forms/client#JumpSkipHint')
    expect(hint.admin.condition({ presentationMode: 'steps' })).toBe(true)
    expect(hint.admin.condition({ presentationMode: 'singlePage' })).toBe(false)
  })

  test('row checkboxes carry the level style', () => {
    const config = formsPlugin({})(baseConfig())
    const checks: { admin?: { style?: unknown; width?: unknown }; defaultValue?: unknown; name: string; type: string }[] = []
    for (const block of inputBlocks()) {
      const required = named<(typeof checks)[number]>(block.fields, 'required')
      checks.push(required)
      expect(required.type, block.slug).toBe('checkbox')
      expect(required.defaultValue, block.slug).toBe(false)
      expect(required.admin?.width, block.slug).toBe('25%')
    }
    // The single checkbox's default shares the prefill row with the parameter input.
    const checkbox = inputBlocks().find((b) => b.slug === 'checkbox')
    const checkboxDefault = named<(typeof checks)[number]>(checkbox?.fields ?? [], 'defaultValue')
    expect(checkboxDefault.type).toBe('checkbox')
    expect(checkboxDefault.defaultValue).toBe(false)
    expect(checkboxDefault.admin?.width).toBe('50%')
    checks.push(checkboxDefault)
    for (const path of ['delivery.emails', 'delivery.webhooks']) {
      const enabled = named<(typeof checks)[number]>(fieldsAt(config, path), 'enabled')
      expect(enabled.type, path).toBe('checkbox')
      expect(enabled.defaultValue, path).toBe(true)
      expect(enabled.admin?.width, path).toBe('20%')
      checks.push(enabled)
    }
    expect(checks.length).toBe(INPUT_TYPES.length + 3)
    for (const check of checks) {
      expect(check.admin?.style, check.name).toBe(LEVEL_CHECKBOX_STYLE)
    }
    expect(LEVEL_CHECKBOX_STYLE).toEqual({ paddingTop: 'calc(var(--base) * 1.6)' })
  })

  test('radio and select options have minRows 2', () => {
    for (const block of inputBlocks()) {
      if (!['checkboxGroup', 'radio', 'select'].includes(block.slug)) {
        continue
      }
      const options = named<{ minRows?: number; type: string }>(block.fields, 'options')
      expect(options.type).toBe('array')
      expect(options.minRows, block.slug).toBe(block.slug === 'checkboxGroup' ? undefined : 2)
    }
  })

  test('prefillFromKey default is a function', () => {
    const config = formsPlugin({
      fields: { fileUpload: true, rating: { block: { slug: 'rating', fields: [{ name: 'rating', type: 'number' }] } } },
    })(baseConfig())
    const blocks = sectionBlocks(config).filter((b) => ['rating', ...INPUT_TYPES].includes(b.slug))
    expect(blocks.length).toBe(INPUT_TYPES.length + 1)
    for (const block of blocks) {
      const lock = named<{ admin?: { hidden?: boolean }; defaultValue?: unknown; type: string }>(block.fields, 'prefillFromKey')
      expect(lock.type, block.slug).toBe('checkbox')
      expect(lock.admin?.hidden, block.slug).toBe(true)
      expect(typeof lock.defaultValue, block.slug).toBe('function')
      expect((lock.defaultValue as (args: unknown) => unknown)({}), block.slug).toBe(block.slug !== 'checkbox')
      // Next to the parameter it locks.
      const names = dataNames(block.fields)
      expect(names.indexOf('prefillFromKey') + 1, block.slug).toBe(names.indexOf('prefillParam'))
    }
  })

  test('key fields use the KeyField component', () => {
    const config = formsPlugin({ fields: { fileUpload: true } })(baseConfig())
    const keyFields: string[] = []
    walk(collection(config, 'custom-forms').fields, (field, p) => {
      if (/^sections(?:\.fields\.[A-Za-z]+)?\.(?:fieldKey|key)$/.test(p) && field.type === 'text') {
        keyFields.push(p)
        expect((field.admin as { components?: { Field?: unknown } }).components?.Field, p).toBe('payload-dynamic-forms/client#KeyField')
      }
    })
    // The section key and the key of all 10 input blocks.
    expect(keyFields).toContain('sections.key')
    expect(keyFields.length).toBe(1 + 10)
    // Rule keys and the prefill parameter use their own components.
    const rule = named<{ admin: { components: { Field: string } } }>(fieldsAt(config, 'sections.visibilityRules.rows'), 'fieldKey')
    expect(rule.admin.components.Field).toBe('payload-dynamic-forms/client#RuleFieldKeyField')
    const target = named<{ admin: { components: { Field: string } } }>(fieldsAt(config, 'sections.nextStepRules'), 'targetSectionKey')
    expect(target.admin.components.Field).toBe('payload-dynamic-forms/client#SectionTargetField')
    for (const block of inputBlocks()) {
      const prefill = named<{ admin: { components: { Field: string }; width: string } }>(block.fields, 'prefillParam')
      expect(prefill.admin.components.Field, block.slug).toBe('payload-dynamic-forms/client#PrefillParamField')
      expect(prefill.admin.width, block.slug).toBe('50%')
      expect(named<{ admin: { width: string } }>(block.fields, 'fieldKey').admin.width, block.slug).toBe('50%')
    }
    expect((rule.admin as unknown as { width: string }).width).toBe('40%')
  })

  test('optional radio questions carry the no-answer hint', () => {
    for (const options of [{}, { optionSources: { posts: { collection: 'posts', labelField: 'title', valueField: 'title' } } }]) {
      const blocks = sectionBlocks(formsPlugin(options as never)(baseConfig()))
      const radio = blocks.find((b) => b.slug === 'radio')!
      const open = openFields(radio.fields)
      const index = open.findIndex((f) => 'name' in f && f.name === 'noAnswerHint')
      expect(index).toBeGreaterThan(-1)
      const hint = open[index] as { admin: { components: { Field: string }; condition: (data: unknown, sibling: unknown) => boolean }; type: string }
      expect(hint.type).toBe('ui')
      expect(hint.admin.components.Field).toBe('payload-dynamic-forms/client#NoAnswerHint')
      expect(hint.admin.condition({}, { required: false })).toBe(true)
      expect(hint.admin.condition({}, {})).toBe(true)
      expect(hint.admin.condition({}, { required: true })).toBe(false)
      // Right after the choice fields, before the default and prefill row.
      const names = open.map((f) => ('name' in f ? f.name : ''))
      const lastChoice = Math.max(...['optionsFrom', 'options', 'sourceItems'].map((n) => names.indexOf(n)))
      expect(index).toBe(lastChoice + 1)
      expect(index).toBeLessThan(names.indexOf('defaultValue'))
      for (const slug of ['select', 'checkboxGroup']) {
        const other = blocks.find((b) => b.slug === slug)!
        expect(JSON.stringify(other.fields), slug).not.toContain('noAnswerHint')
      }
    }
  })

  test('admin component paths name client exports', () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../src/exports/client.ts'), 'utf8')
    expect(source.split('\n')[0]).toMatch(/^['"]use client['"]$/)
    const exported = new Set([...source.matchAll(/export \{ ([\w, ]+) \}/g)].flatMap((m) => m[1].split(', ')))
    expect([...exported].sort()).toEqual([
      'DateValueField',
      'DefaultChoiceField',
      'JumpSkipHint',
      'KeyField',
      'NoAnswerHint',
      'NumberDefaultField',
      'PrefillParamField',
      'QuestionLabel',
      'RowLabel',
      'RuleFieldKeyField',
      'SectionTargetField',
    ])
    const config = formsPlugin({ fields: { fileUpload: true } })(baseConfig())
    const paths: string[] = []
    for (const c of config.collections!) {
      walk(c.fields, (field, p) => {
        const component = (field as { admin?: { components?: { Field?: unknown } } }).admin?.components?.Field
        if (component === undefined) {
          return
        }
        const value = typeof component === 'string' ? component : String((component as { path?: string }).path)
        // Payload's own slug field (`slugField()`) brings Payload's component; every other one is ours.
        if (p === 'slug' && value === '@payloadcms/next/client#SlugField') {
          return
        }
        paths.push(`${p}: ${value}`)
        expect(value, p).toMatch(/^payload-dynamic-forms\/client#\w+$/)
        expect(exported.has(value.split('#')[1]), p).toBe(true)
      })
    }
    // Section key, 10 question keys, 10 prefill parameters, 12 rule keys, the next-step target, the radio hint,
    // the typed defaults (number, date, Earliest, Latest, select, radio, checkbox group) and the jump skip hint.
    expect(paths.length).toBe(1 + 10 + 10 + 12 + 1 + 1 + 7 + 1)
  })

  test('timezone option defaults to UTC and refuses unknown zones', () => {
    expect(resolveOptions({}).timezone).toBe('UTC')
    expect(resolveOptions({ timezone: 'America/New_York' }).timezone).toBe('America/New_York')
    const config = formsPlugin({ timezone: 'America/New_York' })(baseConfig())
    expect((config.custom as { payloadForms: { timezone: string } }).payloadForms.timezone).toBe('America/New_York')
    expect(() => formsPlugin({ timezone: 'Mars/Base' })(baseConfig())).toThrow(/Mars\/Base/)
    expect(() => formsPlugin({ timezone: 'Mars/Base' })(baseConfig())).toThrow('formsPlugin: timezone "Mars/Base" is not a known IANA time zone.')
  })

  test('metadata time zone option defaults to on', () => {
    expect(resolveOptions({}).metadata).toEqual({ ip: false, timeZone: true, userAgent: true })
    expect(resolveOptions({ metadata: { timeZone: false } }).metadata).toEqual({ ip: false, timeZone: false, userAgent: true })
    expect(resolveOptions({ metadata: { ip: true } }).metadata.timeZone).toBe(true)
    // The submission keeps it in a text field of its metadata group.
    let found: Field | undefined
    walk(collection(formsPlugin({})(baseConfig()), 'custom-form-submissions').fields, (field, p) => {
      if (p === 'metadata.timeZone') {
        found = field
      }
    })
    expect(found).toMatchObject({ name: 'timeZone', type: 'text' })
  })

  test('submission record fields are read-only by access', () => {
    const subs = collection(formsPlugin({ attachments: {} })(baseConfig()), 'custom-form-submissions')
    const byName = new Map(subs.fields.filter((f) => 'name' in f).map((f) => [(f as { name: string }).name, f as { access?: Record<string, unknown> } & Field]))
    for (const name of ['form', 'answers', 'snapshot', 'attachments', 'deliveryLog', 'metadata']) {
      const field = byName.get(name)
      expect(field, name).toBeDefined()
      const update = field!.access?.update as ((args: unknown) => unknown) | undefined
      expect(typeof update, name).toBe('function')
      expect(update!({ req: { user: { id: 1, role: 'admin' } } }), name).toBe(false)
      expect(update!({ req: {} }), name).toBe(false)
      expect(Object.keys(field!.access!), name).toEqual(['update'])
    }
    for (const name of ['status', 'resendFailed']) {
      expect(byName.get(name)!.access, name).toBeUndefined()
    }
    // The collection's own update stays admin-only (status and the resend tick).
    expect(typeof subs.access!.update).toBe('function')
  })

  test('every plugin list starts open', () => {
    const config = formsPlugin({ attachments: {}, fields: { fileUpload: true } })(baseConfig())
    const lists = new Map<string, unknown>()
    for (const slug of ['custom-forms', 'custom-form-submissions']) {
      walk(collection(config, slug).fields, (field, p) => {
        if (field.type === 'array' || field.type === 'blocks') {
          const initCollapsed = (field.admin as { initCollapsed?: unknown } | undefined)?.initCollapsed
          expect(initCollapsed, `${slug}:${p}`).not.toBe(true)
          lists.set(`${slug}:${p}`, initCollapsed)
        }
      })
    }
    const open = [
      'custom-forms:sections',
      'custom-forms:sections.fields',
      'custom-forms:sections.visibilityRules.rows',
      'custom-forms:sections.fields.text.visibilityRules.rows',
      'custom-forms:sections.nextStepRules',
      'custom-forms:sections.nextStepRules.rows',
      'custom-forms:delivery.emails',
      'custom-forms:delivery.webhooks',
      'custom-forms:delivery.webhooks.headers',
      'custom-forms:sections.fields.select.options',
      'custom-forms:sections.fields.radio.options',
      'custom-forms:sections.fields.checkboxGroup.options',
      'custom-form-submissions:deliveryLog',
      'custom-form-submissions:snapshot',
    ]
    for (const path of open) {
      expect(lists.has(path), path).toBe(true)
      expect(lists.get(path), path).toBe(false)
    }
    // Every array and blocks field the plugin adds says so (no list is left to the default).
    for (const [path, value] of lists) {
      expect(value, path).toBe(false)
    }
  })

  test('rows name their row label components', () => {
    const config = formsPlugin({
      fields: { fileUpload: true, rating: { block: { slug: 'rating', fields: [{ name: 'rating', type: 'number' }], labels: { plural: 'Ratings', singular: 'Rating' } } } },
    })(baseConfig())
    type Component = { clientProps?: Record<string, unknown>; path: string } | string
    const rowLabelAt = (wanted: string): Component | undefined => {
      let found: Component | undefined
      walk(collection(config, 'custom-forms').fields, (field, p) => {
        if (p === wanted && field.type === 'array') {
          found = (field.admin as { components?: { RowLabel?: Component } } | undefined)?.components?.RowLabel
        }
      })
      return found
    }
    const kinds: Record<string, string | undefined> = {
      'delivery.emails': undefined,
      'delivery.webhooks': undefined,
      'delivery.webhooks.headers': undefined,
      sections: 'section',
      'sections.fields.radio.options': 'option',
      'sections.fields.select.options': 'option',
      'sections.fields.text.visibilityRules.rows': 'rule',
      'sections.nextStepRules': 'jump',
      'sections.nextStepRules.rows': 'rule',
      'sections.visibilityRules.rows': 'rule',
    }
    for (const [p, kind] of Object.entries(kinds)) {
      const component = rowLabelAt(p)
      expect(component, p).toBeDefined()
      const value = typeof component === 'string' ? component : component!.path
      expect(value, p).toBe('payload-dynamic-forms/client#RowLabel')
      expect(typeof component === 'string' ? undefined : component!.clientProps?.kind, p).toBe(kind)
    }
    const blocks = sectionBlocks(config)
    expect(blocks.map((b) => b.slug)).toContain('rating')
    for (const block of blocks) {
      const label = block.admin?.components?.Label as { clientProps: { typeLabel: string }; path: string } | undefined
      expect(label?.path, block.slug).toBe('payload-dynamic-forms/client#QuestionLabel')
      expect(label?.clientProps.typeLabel, block.slug).toBe(block.labels?.singular)
    }
    expect((blocks.find((b) => b.slug === 'date')!.admin!.components!.Label as { clientProps: { typeLabel: string } }).clientProps.typeLabel).toBe('Date')
    // A block with its own Label keeps it.
    const own = sectionBlocks(
      formsPlugin({ fields: { stars: { block: { slug: 'stars', admin: { components: { Label: '/app/StarsLabel#StarsLabel' } }, fields: [] } } } })(baseConfig()),
    ).find((b) => b.slug === 'stars')!
    expect(own.admin!.components!.Label).toBe('/app/StarsLabel#StarsLabel')
    // Every admin component path in the collection names an export of the client entry.
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../src/exports/client.ts'), 'utf8')
    const exported = new Set([...source.matchAll(/export \{ ([\w, ]+) \}/g)].flatMap((m) => m[1].split(', ')))
    const paths: string[] = []
    const collect = (value: unknown, where: string) => {
      if (value === undefined) {
        return
      }
      const p = typeof value === 'string' ? value : String((value as { path?: string }).path)
      if (p === '@payloadcms/next/client#SlugField') {
        return
      }
      paths.push(p)
      expect(p, where).toMatch(/^payload-dynamic-forms\/client#\w+$/)
      expect(exported.has(p.split('#')[1]), where).toBe(true)
    }
    walk(collection(config, 'custom-forms').fields, (field, p) => {
      for (const [slot, value] of Object.entries((field as { admin?: { components?: Record<string, unknown> } }).admin?.components || {})) {
        collect(value, `${p}.${slot}`)
      }
      if (field.type === 'blocks') {
        for (const block of field.blocks) {
          for (const [slot, value] of Object.entries(block.admin?.components || {})) {
            collect(value, `${p}.${block.slug}.${slot}`)
          }
        }
      }
    })
    expect(paths.filter((p) => p.endsWith('#QuestionLabel')).length).toBe(blocks.length)
    expect(paths.filter((p) => p.endsWith('#RowLabel')).length).toBeGreaterThan(10)
  })

  test('send another is an opt-in under the success words', () => {
    const forms = collection(formsPlugin({})(baseConfig()), 'custom-forms')
    let words: Field[] = []
    walk(forms.fields, (field, p) => {
      if (field.type === 'tabs') {
        words = field.tabs.find((tab) => tab.label === 'Words')!.fields
      }
      void p
    })
    const names = words.map((f) => ('name' in f ? f.name : f.type))
    expect(names.indexOf('sendAnother')).toBe(names.indexOf('successType') + 1)
    const box = words[names.indexOf('sendAnother')] as {
      admin: { condition: (data: unknown, sibling: unknown) => boolean }
      defaultValue: unknown
      label: string
      type: string
    }
    expect(box.type).toBe('checkbox')
    expect(box.label).toBe("Show a 'Send another' button")
    expect(box.admin.condition({}, { successType: 'message' })).toBe(true)
    expect(box.admin.condition({}, { successType: 'redirect' })).toBe(false)
    expect(typeof box.defaultValue).toBe('function')
    expect((box.defaultValue as (args: unknown) => unknown)({})).toBe(false)
    const wording = named<{ fields: Field[] }>(words, 'wording')
    const word = named<{ defaultValue: unknown; localized?: boolean; type: string }>(wording.fields, 'sendAnother')
    expect(word.type).toBe('text')
    expect(word.localized).toBe(true)
    expect((word.defaultValue as (args: unknown) => unknown)({})).toBe('Send another')
    // The plugin's words option sets it, like the other words.
    const custom = collection(formsPlugin({ words: { sendAnother: 'Otra vez' } })(baseConfig()), 'custom-forms')
    let customWord: { defaultValue: (args: unknown) => unknown } | undefined
    walk(custom.fields, (field, p) => {
      if (p === 'wording.sendAnother') {
        customWord = field as never
      }
    })
    expect(customWord!.defaultValue({})).toBe('Otra vez')
  })

  test('new 0.5.0 fields have function defaults', () => {
    const config = formsPlugin({})(baseConfig())
    const date = sectionBlocks(config).find((b) => b.slug === 'date')!
    for (const name of ['mode', 'valueFormat', 'displayStyle']) {
      expect(typeof named<{ defaultValue: unknown }>(date.fields, name).defaultValue, name).toBe('function')
    }
    const defaults = new Map<string, unknown>()
    walk(collection(config, 'custom-forms').fields, (field, p) => {
      if (p === 'sendAnother' || p.startsWith('wording.')) {
        defaults.set(p, (field as { defaultValue?: unknown }).defaultValue)
      }
    })
    expect(typeof defaults.get('sendAnother')).toBe('function')
    expect(typeof defaults.get('wording.sendAnother')).toBe('function')
    // Every other word keeps its static default (no column default changes).
    for (const key of WORD_KEYS.filter((k) => k !== 'sendAnother')) {
      expect(defaults.get(`wording.${key}`), key).toBe(DEFAULT_WORDS[key])
    }
    // The submission's new time zone field adds none either.
    let zone: { defaultValue?: unknown } | undefined
    walk(collection(config, 'custom-form-submissions').fields, (field, p) => {
      if (p === 'metadata.timeZone') {
        zone = field as never
      }
    })
    expect(zone!.defaultValue).toBeUndefined()
  })
})
