import type { CollectionConfig, Endpoint } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { adminAccess, loggedIn, nobody, nobodyField } from '../access.js'
import { resendTickHook } from '../hooks/resendTick.js'

export const SUBMISSION_STATUSES = [
  { label: 'Received', value: 'received' },
  { label: 'Processed', value: 'processed' },
  { label: 'Partly failed', value: 'partlyFailed' },
  { label: 'Failed', value: 'failed' },
]

export function submissionsCollection(options: ResolvedOptions, endpoints: Endpoint[]): CollectionConfig {
  const admin = adminAccess(options.isAdmin)
  return {
    slug: options.slugs.submissions,
    access: {
      create: nobody,
      delete: admin,
      read: loggedIn,
      update: admin,
    },
    admin: {
      defaultColumns: ['id', 'form', 'status', 'createdAt'],
      group: 'Forms',
    },
    defaultSort: '-createdAt',
    endpoints,
    fields: [
      // The record (form, answers, snapshot, attachments, delivery log, metadata) is read-only by
      // access, on every API; only the status and the resend tick stay editable by admins.
      { name: 'form', type: 'relationship', access: { update: nobodyField }, relationTo: options.slugs.forms as never, required: true },
      {
        name: 'status',
        type: 'select',
        admin: { position: 'sidebar' },
        dbName: 'sts',
        defaultValue: 'received',
        options: SUBMISSION_STATUSES,
        required: true,
      },
      {
        name: 'resendFailed',
        type: 'checkbox',
        admin: { description: 'Tick and save to run every failed email or webhook again.', position: 'sidebar' },
        defaultValue: false,
        label: 'Resend failed deliveries',
      },
      { name: 'answers', type: 'json', access: { update: nobodyField }, required: true },
      {
        name: 'snapshot',
        type: 'array',
        access: { update: nobodyField },
        admin: { description: 'Each answer as worded when it was sent.', initCollapsed: false, readOnly: true },
        fields: [
          { name: 'sectionKey', type: 'text' },
          { name: 'sectionTitle', type: 'text' },
          { name: 'fieldKey', type: 'text', required: true },
          { name: 'label', type: 'text' },
          { name: 'value', type: 'textarea' },
        ],
      },
      ...(options.attachments
        ? [
            {
              name: 'attachments',
              type: 'relationship' as const,
              access: { update: nobodyField },
              admin: { readOnly: true },
              hasMany: true,
              relationTo: options.attachments.collection as never,
            },
          ]
        : []),
      {
        name: 'deliveryLog',
        type: 'array',
        access: { update: nobodyField },
        admin: { initCollapsed: false, readOnly: true },
        fields: [
          {
            name: 'kind',
            type: 'select',
            dbName: 'k',
            options: [
              { label: 'Email', value: 'email' },
              { label: 'Webhook', value: 'webhook' },
            ],
            required: true,
          },
          { name: 'outputId', type: 'text' },
          { name: 'label', type: 'text' },
          { name: 'target', type: 'text' },
          {
            name: 'result',
            type: 'select',
            dbName: 'res',
            options: [
              { label: 'Success', value: 'success' },
              { label: 'Failed', value: 'failed' },
              { label: 'Skipped', value: 'skipped' },
            ],
            required: true,
          },
          { name: 'error', type: 'textarea' },
          { name: 'tries', type: 'number' },
          { name: 'at', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        ],
      },
      {
        name: 'metadata',
        type: 'group',
        access: { update: nobodyField },
        admin: { readOnly: true },
        fields: [
          { name: 'ip', type: 'text', admin: { description: 'Kept only when the plugin option metadata.ip is on.' } },
          { name: 'userAgent', type: 'textarea' },
          { name: 'locale', type: 'text' },
          {
            name: 'timeZone',
            type: 'text',
            admin: { description: "The visitor's IANA time zone. Kept only when the plugin option metadata.timeZone is on." },
          },
        ],
      },
    ],
    hooks: {
      beforeChange: [resendTickHook(options)],
    },
  }
}