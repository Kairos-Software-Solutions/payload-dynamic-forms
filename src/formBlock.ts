import type { Block } from 'payload'

export type FormBlockOptions = {
  /** Forms collection slug (default `custom-forms`; use the plugin's `slugs.forms` if renamed). */
  formsSlug?: string
  interfaceName?: string
  /** Block slug, default `formBlock`. */
  slug?: string
}

/**
 * A page block that picks one form. Add it to any blocks field; the app's renderer reads the
 * form with `getPublicForm` or the public endpoint. It holds no words of its own.
 */
export function formBlock(options: FormBlockOptions = {}): Block {
  return {
    slug: options.slug || 'formBlock',
    ...(options.interfaceName ? { interfaceName: options.interfaceName } : {}),
    fields: [
      {
        name: 'form',
        type: 'relationship',
        relationTo: (options.formsSlug || 'custom-forms') as never,
        required: true,
      },
    ],
    labels: { plural: 'Forms', singular: 'Form' },
  }
}
