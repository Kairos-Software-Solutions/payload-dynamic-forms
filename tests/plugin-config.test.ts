import type { Block, CollectionConfig, Config, Field } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { LEVEL_CHECKBOX_STYLE } from '../src/collections/adminStyle.js'
import { OPERATORS } from '../src/exports/shared.js'
import { formBlock, formsPlugin } from '../src/index.js'
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
    expect(dataNames(text.fields)).toEqual(
      ['fieldKey', 'width', 'required', 'words', 'minLength', 'maxLength', 'defaultValue', 'prefillFromKey', 'prefillParam', 'visibilityRules'].filter(
        (n) => n !== 'prefillFromKey' || dataNames(text.fields).includes('prefillFromKey'),
      ),
    )
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

  test('field names are unchanged from 0.3.0 apart from prefillFromKey', () => {
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
      expect(added, `${slug} added`).toEqual(INPUT_TYPES.includes(slug) ? ['prefillFromKey'] : [])
    }
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

  test('rule fields are labelled Field and Next section', () => {
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
    const target = named<{ label?: unknown; type: string }>(fieldsAt(config, 'sections.nextStepRules'), 'targetSectionKey')
    expect(target.type).toBe('text')
    expect(target.label).toBe('Next section')
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
    for (const path of ['delivery.emails', 'delivery.webhooks']) {
      const enabled = named<(typeof checks)[number]>(fieldsAt(config, path), 'enabled')
      expect(enabled.type, path).toBe('checkbox')
      expect(enabled.defaultValue, path).toBe(true)
      expect(enabled.admin?.width, path).toBe('20%')
      checks.push(enabled)
    }
    expect(checks.length).toBe(INPUT_TYPES.length + 2)
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
})
