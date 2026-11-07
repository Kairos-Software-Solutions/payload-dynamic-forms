import type { Endpoint } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { RESEND_CONTEXT } from '../hooks/resendTick.js'
import { resendFailedDeliveries, type SubmissionDoc } from '../server/resend.js'

/** `POST /api/<submissions>/:id/resend` — admins only: runs the failed outputs again. */
export function resendEndpoint(options: ResolvedOptions): Endpoint {
  return {
    handler: async (req) => {
      if (!req.user || !options.isAdmin(req)) {
        return Response.json({ message: 'Forbidden', ok: false }, { status: 403 })
      }
      const id = String(req.routeParams?.id || '')
      let submission: SubmissionDoc
      try {
        submission = (await req.payload.findByID({
          id,
          collection: options.slugs.submissions as never,
          depth: 0,
          overrideAccess: true,
        })) as unknown as SubmissionDoc
      } catch {
        return Response.json({ message: 'Not found', ok: false }, { status: 404 })
      }
      const result = await resendFailedDeliveries(req.payload, submission, req)
      if (result.added.length) {
        await req.payload.update({
          id,
          collection: options.slugs.submissions as never,
          context: { [RESEND_CONTEXT]: true },
          data: { deliveryLog: result.log, status: result.status } as never,
          overrideAccess: true,
        })
      }
      return Response.json({ deliveryLog: result.log, ok: true, resent: result.added.length, status: result.status })
    },
    method: 'post',
    path: '/:id/resend',
  }
}
