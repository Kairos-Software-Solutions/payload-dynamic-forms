import type { CollectionConfig, Field } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { adminAccess, loggedIn, nobody } from '../access.js'

/** The fields that link a file to its form, submission and question. */
export function attachmentLinkFields(options: ResolvedOptions): Field[] {
  return [
    { name: 'form', type: 'relationship', admin: { readOnly: true }, relationTo: options.slugs.forms as never },
    { name: 'submission', type: 'relationship', admin: { readOnly: true }, relationTo: options.slugs.submissions as never },
    { name: 'fieldKey', type: 'text', admin: { readOnly: true } },
    { name: 'fieldLabel', type: 'text', admin: { readOnly: true } },
  ]
}

/** Private uploads: created only by the submit endpoint, read by logged-in users. */
export function attachmentsCollection(options: ResolvedOptions): CollectionConfig {
  const admin = adminAccess(options.isAdmin)
  return {
    slug: options.attachments!.collection,
    access: {
      create: nobody,
      delete: admin,
      read: loggedIn,
      update: admin,
    },
    admin: {
      defaultColumns: ['filename', 'fieldLabel', 'form', 'createdAt'],
      group: 'Forms',
      useAsTitle: 'filename',
    },
    fields: attachmentLinkFields(options),
    upload: {
      crop: false,
      focalPoint: false,
      mimeTypes: [...options.attachments!.mimeTypes],
    },
  }
}
