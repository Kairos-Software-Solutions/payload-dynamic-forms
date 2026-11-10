import type { Endpoint } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { getPublicForm, pluginLocale } from '../server/forms.js'

/** `GET /api/<forms>/public/:slug` — the published form, ready to render, without delivery settings. */
export function publicFormEndpoint(options: ResolvedOptions): Endpoint {
  return {
    handler: async (req) => {
      const slug = String(req.routeParams?.slug || '')
      const form = slug ? await getPublicForm(req.payload, slug, { locale: pluginLocale(req.payload, req.locale), req }) : null
      if (!form) {
        return Response.json({ message: options.words.notFound, ok: false }, { status: 404 })
      }
      return Response.json(form, { status: 200 })
    },
    method: 'get',
    path: '/public/:slug',
  }
}
