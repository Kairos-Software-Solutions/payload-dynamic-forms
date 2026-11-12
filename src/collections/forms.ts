import type { Block, CollectionConfig, Endpoint, Field, FieldAccess } from 'payload'

import { slugField } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { adminFieldAccess, loggedIn } from '../access.js'
import { validateFormBeforeSave } from '../hooks/validateForm.js'
import { DEFAULT_WHATSAPP_ROW_TEMPLATE, DEFAULT_WHATSAPP_TEMPLATE } from '../shared/whatsapp.js'
import { WORD_KEYS } from '../shared/words.js'
import { LEVEL_CHECKBOX_STYLE } from './adminStyle.js'
import { ROW_LABEL, rowLabel } from './rowLabels.js'
import { jumpSkipHintField, nextStepRulesField, ruleGroupField } from './ruleFields.js'

const WORD_HELP: Record<string, string> = {
  errorPrefix: 'Shown above the field errors.',
  fileRejected: 'Field error for a file that is refused. {{label}} is the field label.',
  invalid: 'Field error for a bad value. {{label}} is the field label.',
  no: 'An unticked checkbox in emails, WhatsApp messages, webhooks and the stored snapshot.',
  required: 'Field error for a missing answer. {{label}} is the field label.',
  stepProgress: '{{current}} and {{total}} are the step numbers.',
  yes: 'A ticked checkbox in emails, WhatsApp messages, webhooks and the stored snapshot.',
}

function wordingField(options: ResolvedOptions): Field {
  return {
    name: 'wording',
    type: 'group',
    admin: { description: 'Every word visitors read besides the questions. New forms start with the defaults.' },
    fields: WORD_KEYS.map(
      (key): Field =>
        ({
          name: key,
          type: key === 'success' || key === 'closed' ? 'textarea' : 'text',
          admin: WORD_HELP[key] ? { description: WORD_HELP[key] } : undefined,
          defaultValue: options.words[key],
          localized: true,
        }) as Field,
    ),
    label: 'Form wording',
  }
}

/** The webhook row's admin-only secret fields; left out with `webhooks.secretsInAdmin: false`. */
function secretFields(secret: FieldAccess): Field[] {
  return [
    {
      name: 'headers',
      type: 'array',
      access: { create: secret, read: secret, update: secret },
      admin: { components: { RowLabel: ROW_LABEL }, description: 'Secret headers (admins only).', initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'key', type: 'text', admin: { width: '50%' }, required: true },
            { name: 'value', type: 'text', admin: { width: '50%' }, required: true },
          ],
        },
      ],
    },
    {
      name: 'signingSecret',
      type: 'text',
      access: { create: secret, read: secret, update: secret },
      admin: {
        description:
          'Signs the body: X-Form-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">, plus the Standard Webhooks headers. Empty: the plugin config\'s secret, if any (admins only).',
      },
    },
  ]
}

const EMAIL_LANGUAGE_HELP = "Visitor copies use the visitor's language; team emails use the default language."

function deliveryField(options: ResolvedOptions): Field {
  const secret = adminFieldAccess(options.isAdmin)
  return {
    name: 'delivery',
    type: 'group',
    access: { read: loggedIn },
    fields: [
      {
        name: 'store',
        type: 'checkbox',
        admin: { description: 'Save each submission. Off: nothing is written; email, webhooks and WhatsApp still run.' },
        defaultValue: true,
        label: 'Store submissions',
      },
      {
        name: 'emails',
        type: 'array',
        admin: { components: { RowLabel: ROW_LABEL }, initCollapsed: false },
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'label', type: 'text', admin: { width: '50%' }, required: true },
              {
                name: 'kind',
                type: 'select',
                admin: { width: '30%' },
                dbName: 'k',
                defaultValue: 'team',
                options: [
                  { label: 'Team (fixed addresses)', value: 'team' },
                  { label: 'Visitor copy', value: 'visitor' },
                ],
              },
              { name: 'enabled', type: 'checkbox', admin: { style: LEVEL_CHECKBOX_STYLE, width: '20%' }, defaultValue: true },
            ],
          },
          {
            name: 'to',
            type: 'text',
            admin: {
              condition: (_d, sibling) => sibling?.kind !== 'visitor',
              description: 'Fixed addresses, separated by commas. No {{tokens}}: use a visitor copy instead.',
            },
          },
          {
            name: 'visitorField',
            type: 'text',
            admin: {
              condition: (_d, sibling) => sibling?.kind === 'visitor',
              description: 'Key of the email field whose answer gets the copy.',
            },
          },
          {
            type: 'row',
            fields: [
              { name: 'cc', type: 'text', admin: { width: '50%' } },
              { name: 'bcc', type: 'text', admin: { width: '50%' } },
            ],
          },
          {
            type: 'row',
            fields: [
              { name: 'from', type: 'text', admin: { description: "Empty: the email adapter's default.", width: '50%' } },
              { name: 'replyToField', type: 'text', admin: { description: 'Key of an email field to reply to.', width: '50%' } },
            ],
          },
          {
            name: 'subject',
            type: 'text',
            admin: { description: EMAIL_LANGUAGE_HELP },
            defaultValue: 'New submission: {{formTitle}}',
            localized: true,
          },
          {
            name: 'body',
            type: 'textarea',
            admin: {
              description: `Tokens: {{key}}, {{key.attribute}}, {{*}}, {{*:table}}, {{formTitle}}, {{submissionId}}. ${EMAIL_LANGUAGE_HELP}`,
            },
            defaultValue: '{{*:table}}',
            localized: true,
          },
        ],
      },
      {
        name: 'webhooks',
        type: 'array',
        admin: { components: { RowLabel: ROW_LABEL }, initCollapsed: false },
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'label', type: 'text', admin: { width: '50%' }, required: true },
              {
                name: 'method',
                type: 'select',
                admin: { width: '30%' },
                dbName: 'mth',
                defaultValue: 'POST',
                options: ['POST', 'PUT', 'PATCH'],
              },
              { name: 'enabled', type: 'checkbox', admin: { style: LEVEL_CHECKBOX_STYLE, width: '20%' }, defaultValue: true },
            ],
          },
          { name: 'url', type: 'text', admin: { description: 'https only.' }, required: true },
          {
            type: 'row',
            fields: [
              {
                name: 'payloadMode',
                type: 'select',
                admin: { width: '40%' },
                dbName: 'pmd',
                defaultValue: 'full',
                options: [
                  { label: 'Full (form, submission, answers)', value: 'full' },
                  { label: 'Answers only', value: 'answersOnly' },
                ],
              },
              { name: 'timeoutMs', type: 'number', admin: { width: '30%' }, defaultValue: 8000, max: 30000, min: 500 },
              { name: 'retries', type: 'number', admin: { width: '30%' }, defaultValue: 0, max: 3, min: 0 },
            ],
          },
          ...(options.webhooks.secretsInAdmin ? secretFields(secret) : []),
        ],
      },
      {
        name: 'whatsapp',
        type: 'group',
        fields: [
          { name: 'enabled', type: 'checkbox', defaultValue: false, label: 'Build a WhatsApp link' },
          {
            name: 'number',
            type: 'text',
            admin: { condition: (_d, sibling) => Boolean(sibling?.enabled), description: 'Empty: the app\'s number.' },
          },
          {
            name: 'messageTemplate',
            type: 'textarea',
            admin: { condition: (_d, sibling) => Boolean(sibling?.enabled) },
            defaultValue: DEFAULT_WHATSAPP_TEMPLATE,
            localized: true,
          },
          {
            name: 'rowTemplate',
            type: 'text',
            admin: { condition: (_d, sibling) => Boolean(sibling?.enabled) },
            defaultValue: DEFAULT_WHATSAPP_ROW_TEMPLATE,
            localized: true,
          },
        ],
        label: 'WhatsApp',
      },
    ],
    label: 'Delivery',
  }
}

export function formsCollection(options: ResolvedOptions, blocks: Block[], endpoints: Endpoint[]): CollectionConfig {
  return {
    slug: options.slugs.forms,
    access: {
      create: loggedIn,
      delete: loggedIn,
      read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
      update: loggedIn,
    },
    admin: {
      defaultColumns: ['title', 'slug', 'intakeState', '_status', 'updatedAt'],
      group: 'Forms',
      useAsTitle: 'title',
    },
    defaultPopulate: {
      slug: true,
      intakeState: true,
      presentationMode: true,
      sections: true,
      successRedirectURL: true,
      successType: true,
      title: true,
      wording: true,
    },
    endpoints,
    fields: [
      { name: 'title', type: 'text', localized: true, required: true },
      slugField({ useAsSlug: 'title' }),
      {
        type: 'tabs',
        tabs: [
          {
            fields: [
              {
                type: 'row',
                fields: [
                  {
                    name: 'presentationMode',
                    type: 'select',
                    admin: { width: '50%' },
                    dbName: 'pm',
                    defaultValue: 'steps',
                    options: [
                      { label: 'Step by step', value: 'steps' },
                      { label: 'Single page', value: 'singlePage' },
                    ],
                    required: true,
                  },
                  {
                    name: 'intakeState',
                    type: 'select',
                    admin: { width: '50%' },
                    dbName: 'ist',
                    defaultValue: 'open',
                    options: [
                      { label: 'Open', value: 'open' },
                      { label: 'Closed', value: 'closed' },
                    ],
                    required: true,
                  },
                ],
              },
              {
                name: 'sections',
                type: 'array',
                admin: { components: { RowLabel: rowLabel('section') }, initCollapsed: false },
                fields: [
                  {
                    type: 'row',
                    fields: [
                      {
                        name: 'key',
                        type: 'text',
                        admin: {
                          components: { Field: 'payload-dynamic-forms/client#KeyField' },
                          description: 'Lower-case letters, numbers and dashes. Used in rules, links and {{tokens}}.',
                          width: '40%',
                        },
                        required: true,
                      },
                      { name: 'title', type: 'text', admin: { width: '60%' }, localized: true },
                    ],
                  },
                  { name: 'description', type: 'textarea', localized: true },
                  {
                    name: 'fields',
                    type: 'blocks',
                    admin: { initCollapsed: false },
                    blocks,
                  },
                  ruleGroupField('visibilityRules', 'Show section when'),
                  nextStepRulesField(),
                  jumpSkipHintField(),
                ],
                minRows: 1,
                required: true,
              },
            ],
            label: 'Structure',
          },
          {
            fields: [
              {
                name: 'successType',
                type: 'radio',
                dbName: 'st',
                defaultValue: 'message',
                options: [
                  { label: 'Show the success words', value: 'message' },
                  { label: 'Redirect', value: 'redirect' },
                ],
              },
              {
                name: 'successRedirectURL',
                type: 'text',
                admin: { condition: (_d, sibling) => sibling?.successType === 'redirect' },
              },
              wordingField(options),
            ],
            label: 'Words',
          },
          { fields: [deliveryField(options)], label: 'Delivery' },
        ],
      },
    ],
    hooks: {
      beforeValidate: [validateFormBeforeSave(options)],
    },
    versions: {
      drafts: true,
      maxPerDoc: 20,
    },
  }
}