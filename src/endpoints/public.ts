import type { Endpoint } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { getPublicForm, pluginLocale } from '../server/forms.js'

/**
 * `GET /api/<forms>/public/:slug` — the published form, ready to render, without delivery settings.
 * `?draft=true` gives a logged-in user the newest draft their read access allows (for previews);
 * such answers are never cached.
 */
export function publicFormEndpoint(options: ResolvedOptions): Endpoint {
  return {
    handler: async (req) => {
      const slug = String(req.routeParams?.slug || '')
      const draft = req.searchParams?.get('draft') === 'true'
      const headers: HeadersInit = draft ? { 'Cache-Control': 'private, no-store' } : {}
      const form = slug ? await getPublicForm(req.payload, slug, { draft, locale: pluginLocale(req.payload, req.locale), req }) : null
      if (!form) {
        return Response.json({ message: options.words.notFound, ok: false }, { headers, status: 404 })
      }
      return Response.json(form, { headers, status: 200 })
    },
    method: 'get',
    path: '/public/:slug',
  }
}
