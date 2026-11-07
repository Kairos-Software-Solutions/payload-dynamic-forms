import type { Block, CollectionConfig, Config, Field } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { formBlock, formsPlugin } from '../src/index.js'
import { OPERATORS } from '../src/exports/shared.js'

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
      for (const block of field.blocks as Block[]) {
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
      blocks = field.blocks as Block[]
    }
  })
  return blocks
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
})
