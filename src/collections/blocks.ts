import type { Block, Field } from 'payload'

import type { FieldTypeChecks } from '../shared/types.js'
import type { FieldTypeDefinition, FormsPluginOptions, OptionSource } from '../types.js'

import { dateFormatWords, dateMode, isDateLimitValue } from '../shared/dates.js'
import { LEVEL_CHECKBOX_STYLE } from './adminStyle.js'
import { ruleGroupField } from './ruleFields.js'

const CLIENT = 'payload-dynamic-forms/client'

/**
 * Earliest or Latest of a date question: wall-time text in the question's mode, or `today`
 * (not on Time questions), picked with `DateValueField`. Names unchanged from 0.3.0.
 */
function dateLimit(name: string, label: string): Field {
  return {
    name,
    type: 'text',
    admin: { components: { Field: { clientProps: { limit: true }, path: `${CLIENT}#DateValueField` } }, width: '50%' },
    label,
    validate: (value: unknown, { siblingData }: { siblingData?: unknown }) => {
      if (value === null || value === undefined || value === '') {
        return true
      }
      const mode = dateMode(siblingData as never)
      if (isDateLimitValue(value, mode)) {
        return true
      }
      return mode === 'timeOnly' ? `Use ${dateFormatWords(mode)}.` : `Use ${dateFormatWords(mode)} or today.`
    },
  } as Field
}

/**
 * The date question's settings, in one row before the limits. Function defaults, so the
 * database gets no column default; a stored NULL (a 0.4.0 row) reads as the default everywhere.
 */
function dateSettingsRow(): Field {
  return {
    type: 'row',
    fields: [
      {
        name: 'mode',
        type: 'select',
        admin: { width: '33%' },
        dbName: 'dm',
        defaultValue: () => 'dayOnly',
        label: 'Asks for',
        options: [
          { label: 'Date', value: 'dayOnly' },
          { label: 'Date and time', value: 'dayAndTime' },
          { label: 'Time', value: 'timeOnly' },
        ],
      },
      {
        name: 'valueFormat',
        type: 'select',
        admin: { condition: (_data, sibling) => sibling?.mode === 'dayAndTime', width: '33%' },
        dbName: 'dvf',
        defaultValue: () => 'local',
        label: 'Stored as',
        options: [
          { label: "As the visitor's browser sends it", value: 'local' },
          { label: 'UTC instant (ISO 8601)', value: 'utc' },
        ],
      },
      {
        name: 'displayStyle',
        type: 'select',
        admin: { width: '34%' },
        dbName: 'dds',
        defaultValue: () => 'asStored',
        label: 'In emails and messages',
        options: [
          { label: 'As stored', value: 'asStored' },
          { label: 'Short', value: 'short' },
          { label: 'Medium', value: 'medium' },
          { label: 'Long', value: 'long' },
        ],
      },
    ],
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

const TEXT_DEFAULT: Field = { name: 'defaultValue', type: 'text', localized: true }

/** Typed defaults (design 1): never localized; every one a text column (design 2). */
const EMAIL_DEFAULT: Field = { name: 'defaultValue', type: 'email' }
const NUMBER_DEFAULT: Field = {
  name: 'defaultValue',
  type: 'text',
  admin: { components: { Field: `${CLIENT}#NumberDefaultField` } },
}
const DATE_DEFAULT: Field = {
  name: 'defaultValue',
  type: 'text',
  admin: { components: { Field: `${CLIENT}#DateValueField` } },
}

/** What `DefaultChoiceField` needs of the option sources: plain, serialisable data only. */
function clientSources(sources: Record<string, OptionSource>) {
  return Object.fromEntries(
    Object.entries(sources).map(([key, s]) => [key, { collection: String(s.collection), labelField: s.labelField, valueField: s.valueField }]),
  )
}

function choiceDefault(sources: Record<string, OptionSource>, multiple = false): Field {
  const clientProps: Record<string, unknown> = {}
  if (multiple) {
    clientProps.multiple = true
  }
  if (Object.keys(sources).length) {
    clientProps.sources = clientSources(sources)
  }
  return {
    name: 'defaultValue',
    type: 'text',
    admin: { components: { Field: { clientProps, path: `${CLIENT}#DefaultChoiceField` } } },
  }
}

/** What a question is: the key row (key, width, required) and its words. */
export function headFields(): Field[] {
  return [
    {
      type: 'row',
      fields: [
        {
          name: 'fieldKey',
          type: 'text',
          admin: {
            components: { Field: 'payload-dynamic-forms/client#KeyField' },
            description: 'Lower-case letters, numbers and dashes. Used in rules, links and {{tokens}}.',
            width: '50%',
          },
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
          admin: { style: LEVEL_CHECKBOX_STYLE, width: '25%' },
          defaultValue: false,
        },
      ],
    },
    fieldWordsField(),
  ]
}

const LOCKED = () => true

/**
 * The default answer and the link parameter that prefills it. `prefillFromKey` is the hidden lock
 * (like Payload's `generateSlug`): true, the parameter follows the key on save. Its default is a
 * function, so the database gets no column default and rows saved before 0.4.0 stay NULL
 * (unlocked). `lockDefault` is `() => false` for the single checkbox block (no pre-ticked consent).
 */
export function prefillRow(defaultValue: Field = TEXT_DEFAULT, lockDefault: () => boolean = LOCKED): Field[] {
  return [
    {
      type: 'row',
      fields: [
        { ...defaultValue, admin: { ...(defaultValue.admin as object), width: '50%' } } as Field,
        {
          name: 'prefillFromKey',
          type: 'checkbox',
          admin: { hidden: true },
          defaultValue: lockDefault,
        },
        {
          name: 'prefillParam',
          type: 'text',
          admin: {
            components: { Field: 'payload-dynamic-forms/client#PrefillParamField' },
            description: 'Link parameter that prefills this answer. Locked: the key.',
            width: '50%',
          },
          label: 'Prefill from link parameter',
        },
      ],
    },
  ]
}

/**
 * Fields every input block has, in their admin order: key row, words, default and link parameter,
 * rules. A block's own fields go between the words and the default row (see `builtInBlocks`).
 */
export function baseInputFields(defaultValue: Field = TEXT_DEFAULT): Field[] {
  return [...headFields(), ...prefillRow(defaultValue), ruleGroupField()]
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

function choiceFields(sources: Record<string, OptionSource>, { minOptions }: { minOptions?: number } = {}): Field[] {
  const sourceKeys = Object.keys(sources)
  const typedOptions: Field = {
    name: 'options',
    type: 'array',
    admin: sourceKeys.length
      ? { condition: (_data, sibling) => !sibling?.optionsFrom || sibling.optionsFrom === 'typed' }
      : {},
    ...(minOptions ? { minRows: minOptions } : {}),
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
  const collections = [...new Set(sourceKeys.map((key) => String(sources[key].collection)))]
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

/** Editor hint under an optional radio question's choices; stores nothing. */
function noAnswerHintField(): Field {
  return {
    name: 'noAnswerHint',
    type: 'ui',
    admin: {
      components: { Field: 'payload-dynamic-forms/client#NoAnswerHint' },
      condition: (_data, sibling) => !sibling?.required,
    },
  }
}

export type BlockContext = {
  mimeTypes: string[]
  sources: Record<string, OptionSource>
}

/** The built-in field blocks, in their admin order. */
export function builtInBlocks(ctx: BlockContext): Record<string, Block> {
  // What the question is, then the type's own fields, then the default and prefill row, rules last.
  const input = (slug: string, singular: string, typeFields: Field[], defaultValue?: Field, lockDefault?: () => boolean): Block => ({
    slug,
    fields: [...headFields(), ...typeFields, ...prefillRow(defaultValue, lockDefault), ruleGroupField()],
    labels: { plural: `${singular} fields`, singular },
  })
  return {
    // A single checkbox starts unlocked with no parameter: a link can't pre-tick a consent box.
    // Its default shares the prefill row with an input, so it gets the level style.
    checkbox: input(
      'checkbox',
      'Checkbox',
      [],
      { name: 'defaultValue', type: 'checkbox', admin: { style: LEVEL_CHECKBOX_STYLE }, defaultValue: false },
      () => false,
    ),
    // Several option values, joined by commas (the 0.4.0 format).
    checkboxGroup: input('checkboxGroup', 'Checkbox group', choiceFields(ctx.sources), choiceDefault(ctx.sources, true)),
    date: input(
      'date',
      'Date',
      [dateSettingsRow(), { type: 'row', fields: [dateLimit('minDate', 'Earliest'), dateLimit('maxDate', 'Latest')] }],
      DATE_DEFAULT,
    ),
    email: input('email', 'Email', [], EMAIL_DEFAULT),
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
    number: input('number', 'Number', [
      {
        type: 'row',
        fields: [
          { name: 'min', type: 'number', admin: { width: '50%' } },
          { name: 'max', type: 'number', admin: { width: '50%' } },
        ],
      },
    ], NUMBER_DEFAULT),
    radio: input('radio', 'Radio', [...choiceFields(ctx.sources, { minOptions: 2 }), noAnswerHintField()], choiceDefault(ctx.sources)),
    select: input('select', 'Select', choiceFields(ctx.sources, { minOptions: 2 }), choiceDefault(ctx.sources)),
    text: input('text', 'Text', [lengthLimits()]),
    textarea: input('textarea', 'Long text', [lengthLimits()]),
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
  ctx: { attachmentsOn: boolean } & BlockContext,
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
    blocks.push(isPlainObject(entry) ? deepMerge(builtIns[type], entry) : builtIns[type])
  }

  for (const [type, entry] of Object.entries(registry)) {
    if ((BUILT_IN_TYPES as readonly string[]).includes(type) || entry === false || entry === true) {
      continue
    }
    if (!isDefinition(entry)) {
      throw new Error(`formsPlugin: field type "${type}" is not built in and needs { block, validate? }.`)
    }
    const own = new Set(entry.block.fields.map((f) => ('name' in f ? f.name : '')).filter(Boolean))
    const notOwn = (f: Field) => !('name' in f) || !own.has(f.name)
    // The type's own fields after the key row and words, before the default row and the rules.
    const fields = [
      ...headFields().filter(notOwn),
      ...entry.block.fields,
      ...prefillRow().filter(notOwn),
      ...[ruleGroupField()].filter(notOwn),
    ]
    blocks.push({ ...entry.block, slug: entry.block.slug || type, fields })
    fieldTypes[entry.block.slug || type] = {
      normalize: entry.normalize,
      toText: entry.toText,
      validate: entry.validate,
    }
  }
  return { blocks, fieldTypes }
}