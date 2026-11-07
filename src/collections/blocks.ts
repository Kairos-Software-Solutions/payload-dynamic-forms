import type { Block, Field } from 'payload'

import type { FieldTypeDefinition, FormsPluginOptions, OptionSource } from '../types.js'
import type { FieldTypeChecks } from '../shared/types.js'

import { ruleGroupField } from './ruleFields.js'

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/

function dateLimit(name: string, label: string): Field {
  return {
    name,
    type: 'text',
    admin: { description: 'YYYY-MM-DD', width: '50%' },
    label,
    validate: (value: unknown) =>
      !value || (typeof value === 'string' && DATE_TEXT.test(value)) ? true : 'Use YYYY-MM-DD.',
  }
}

/** Every word one question shows, grouped and localized. */
export function fieldWordsField(): Field {
  return {
    type: 'collapsible',
    admin: { initCollapsed: false },
    fields: [
      {
        name: 'words',
        type: 'group',
        fields: [
          { name: 'label', type: 'text', localized: true, required: true },
          { name: 'hint', type: 'textarea', localized: true },
          { name: 'placeholder', type: 'text', localized: true },
          {
            type: 'row',
            fields: [
              { name: 'errorEmpty', type: 'text', admin: { description: 'Shown when a required answer is missing. Empty: the form\'s "required" words.', width: '50%' }, localized: true },
              { name: 'errorInvalid', type: 'text', admin: { description: 'Shown when the answer is not valid. Empty: the form\'s "invalid" words.', width: '50%' }, localized: true },
            ],
          },
          { name: 'rowLabel', type: 'text', admin: { description: 'Label of this answer in messages. Empty: the label.' }, localized: true },
        ],
        label: false,
      },
    ],
    label: 'Words',
  }
}

/** Fields every input block has: key, width, required, words, default, link parameter, rules. */
export function baseInputFields(defaultValue: Field = { name: 'defaultValue', type: 'text', localized: true }): Field[] {
  return [
    {
      type: 'row',
      fields: [
        {
          name: 'fieldKey',
          type: 'text',
          admin: { description: 'Stored as lower-case kebab-case. Used in rules and {{tokens}}.', width: '50%' },
          label: 'Key',
          required: true,
        },
        {
          name: 'width',
          type: 'select',
          admin: { width: '25%' },
          dbName: 'w',
          defaultValue: 'full',
          options: [
            { label: 'Full', value: 'full' },
            { label: 'Half', value: 'half' },
          ],
        },
        {
          name: 'required',
          type: 'checkbox',
          admin: { width: '25%' },
          defaultValue: false,
        },
      ],
    },
    fieldWordsField(),
    {
      type: 'row',
      fields: [
        { ...defaultValue, admin: { ...(defaultValue.admin as object), width: '50%' } } as Field,
        {
          name: 'prefillParam',
          type: 'text',
          admin: { description: 'Link parameter that prefills this answer, e.g. need for ?need=…', width: '50%' },
          label: 'Prefill from link parameter',
        },
      ],
    },
    ruleGroupField(),
  ]
}

function lengthLimits(): Field {
  return {
    type: 'row',
    fields: [
      { name: 'minLength', type: 'number', admin: { width: '50%' }, min: 0 },
      { name: 'maxLength', type: 'number', admin: { width: '50%' }, min: 0 },
    ],
  }
}

function choiceFields(sources: Record<string, OptionSource>): Field[] {
  const sourceKeys = Object.keys(sources)
  const typedOptions: Field = {
    name: 'options',
    type: 'array',
    admin: sourceKeys.length
      ? { condition: (_data, sibling) => !sibling?.optionsFrom || sibling.optionsFrom === 'typed' }
      : {},
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'label', type: 'text', admin: { width: '50%' }, localized: true, required: true },
          { name: 'value', type: 'text', admin: { width: '50%' }, required: true },
        ],
      },
    ],
  }
  if (!sourceKeys.length) {
    return [typedOptions]
  }
  const collections = [...new Set(sourceKeys.map((key) => String(sources[key]!.collection)))]
  return [
    {
      name: 'optionsFrom',
      type: 'select',
      dbName: 'of',
      defaultValue: 'typed',
      label: 'Choices from',
      options: [
        { label: 'Typed here', value: 'typed' },
        ...sourceKeys.map((key) => ({ label: key, value: key })),
      ],
    },
    typedOptions,
    {
      name: 'sourceItems',
      type: 'relationship',
      admin: {
        condition: (_data, sibling) => Boolean(sibling?.optionsFrom && sibling.optionsFrom !== 'typed'),
        description: 'Pick and order the items. Empty: every published item, in the collection\'s default order.',
        isSortable: true,
      },
      filterOptions: ({ relationTo, siblingData }) => {
        const key = (siblingData as { optionsFrom?: string } | undefined)?.optionsFrom
        const source = key ? sources[key] : undefined
        return Boolean(source && String(source.collection) === relationTo)
      },
      hasMany: true,
      relationTo: collections as never,
    },
  ]
}

export type BlockContext = {
  mimeTypes: string[]
  sources: Record<string, OptionSource>
}

/** The built-in field blocks, in their admin order. */
export function builtInBlocks(ctx: BlockContext): Record<string, Block> {
  const input = (slug: string, singular: string, extra: Field[], defaultValue?: Field): Block => ({
    slug,
    fields: [...baseInputFields(defaultValue), ...extra],
    labels: { plural: `${singular} fields`, singular },
  })
  return {
    heading: {
      slug: 'heading',
      fields: [
        { name: 'heading', type: 'text', localized: true, required: true },
        {
          name: 'level',
          type: 'select',
          dbName: 'lvl',
          defaultValue: 'h3',
          options: ['h2', 'h3', 'h4'],
        },
      ],
      labels: { plural: 'Headings', singular: 'Heading' },
    },
    helpText: {
      slug: 'helpText',
      fields: [{ name: 'body', type: 'textarea', localized: true, required: true }],
      labels: { plural: 'Help texts', singular: 'Help text' },
    },
    text: input('text', 'Text', [lengthLimits()]),
    email: input('email', 'Email', []),
    textarea: input('textarea', 'Long text', [lengthLimits()]),
    number: input('number', 'Number', [
      {
        type: 'row',
        fields: [
          { name: 'min', type: 'number', admin: { width: '50%' } },
          { name: 'max', type: 'number', admin: { width: '50%' } },
        ],
      },
    ]),
    date: input('date', 'Date', [{ type: 'row', fields: [dateLimit('minDate', 'Earliest'), dateLimit('maxDate', 'Latest')] }]),
    select: input('select', 'Select', choiceFields(ctx.sources)),
    radio: input('radio', 'Radio', choiceFields(ctx.sources)),
    checkbox: input('checkbox', 'Checkbox', [], { name: 'defaultValue', type: 'checkbox', defaultValue: false }),
    checkboxGroup: input('checkboxGroup', 'Checkbox group', choiceFields(ctx.sources), {
      name: 'defaultValue',
      type: 'text',
      admin: { description: 'Values, separated by commas.' },
    }),
    fileUpload: input(
      'fileUpload',
      'File upload',
      [
        {
          type: 'row',
          fields: [
            { name: 'maxFiles', type: 'number', admin: { width: '50%' }, defaultValue: 1, max: 10, min: 1 },
            { name: 'maxFileSizeMB', type: 'number', admin: { description: 'Empty: the plugin limit.', width: '50%' }, min: 0 },
          ],
        },
        {
          name: 'mimeTypes',
          type: 'select',
          admin: { description: 'Empty: every type the plugin allows.' },
          dbName: 'mime',
          hasMany: true,
          options: ctx.mimeTypes.map((type) => ({ label: type, value: type })),
        },
      ],
      { name: 'defaultValue', type: 'text', admin: { hidden: true } },
    ),
  }
}

export const BUILT_IN_TYPES = [
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
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

/** Deep-merges plain objects; arrays and other values from `patch` replace. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? deepMerge(out[key], value) : value
  }
  return out as T
}

function isDefinition(value: unknown): value is FieldTypeDefinition {
  return isPlainObject(value) && isPlainObject(value.block) && typeof value.block.slug === 'string'
}

/**
 * Applies the `fields` registry: built-ins on/off (fileUpload off by default), partial blocks
 * merged, new types added with the common input fields. Returns the blocks and the checks for
 * app-defined types.
 */
export function buildFieldBlocks(
  registry: FormsPluginOptions['fields'] = {},
  ctx: BlockContext & { attachmentsOn: boolean },
): { blocks: Block[]; fieldTypes: Record<string, FieldTypeChecks> } {
  const builtIns = builtInBlocks(ctx)
  const blocks: Block[] = []
  const fieldTypes: Record<string, FieldTypeChecks> = {}

  for (const type of BUILT_IN_TYPES) {
    const entry = registry[type]
    const on = entry === undefined ? type !== 'fileUpload' : entry !== false
    if (!on) {
      continue
    }
    if (type === 'fileUpload' && !ctx.attachmentsOn) {
      throw new Error('formsPlugin: the fileUpload field type needs attachments (attachments is false).')
    }
    if (isDefinition(entry)) {
      blocks.push(entry.block)
      fieldTypes[type] = { normalize: entry.normalize, toText: entry.toText, validate: entry.validate }
      continue
    }
    blocks.push(isPlainObject(entry) ? deepMerge(builtIns[type]!, entry) : builtIns[type]!)
  }

  for (const [type, entry] of Object.entries(registry)) {
    if ((BUILT_IN_TYPES as readonly string[]).includes(type) || entry === false || entry === true) {
      continue
    }
    if (!isDefinition(entry)) {
      throw new Error(`formsPlugin: field type "${type}" is not built in and needs { block, validate? }.`)
    }
    const own = new Set(entry.block.fields.map((f) => ('name' in f ? f.name : '')).filter(Boolean))
    const base = baseInputFields().filter((f) => !('name' in f) || !own.has(f.name))
    blocks.push({ ...entry.block, slug: entry.block.slug || type, fields: [...base, ...entry.block.fields] })
    fieldTypes[entry.block.slug || type] = {
      normalize: entry.normalize,
      toText: entry.toText,
      validate: entry.validate,
    }
  }
  return { blocks, fieldTypes }
}
