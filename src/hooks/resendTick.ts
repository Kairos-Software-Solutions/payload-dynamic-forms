import type { CollectionBeforeChangeHook } from 'payload'

import type { ResolvedOptions } from '../types.js'

import { resendFailedDeliveries, type SubmissionDoc } from '../server/resend.js'

export const RESEND_CONTEXT = 'payloadFormsResend'

/**
 * "Resend failed deliveries" in the sidebar: on save with the box ticked, run the failed outputs
 * again (through `delivery.schedule` when set), add the tries to the log and save the box unticked.
 */
export function resendTickHook(options: ResolvedOptions): CollectionBeforeChangeHook {
  return async ({ context, data, operation, originalDoc, req }) => {
    if (operation !== 'update' || !data?.resendFailed || context?.[RESEND_CONTEXT]) {
      return data
    }
    data.resendFailed = false
    const submission = { ...(originalDoc as SubmissionDoc), ...(data as Partial<SubmissionDoc>) } as SubmissionDoc
    if (options.delivery?.schedule) {
      const payload = req.payload
      options.delivery.schedule(async () => {
        try {
          const fresh = (await payload.findByID({
            id: submission.id,
            collection: options.slugs.submissions as never,
            depth: 0,
            overrideAccess: true,
          })) as unknown as SubmissionDoc
          const result = await resendFailedDeliveries(payload, fresh, req)
          await payload.update({
            id: submission.id,
            collection: options.slugs.submissions as never,
            context: { [RESEND_CONTEXT]: true },
            data: { deliveryLog: result.log, status: result.status } as never,
            overrideAccess: true,
          })
        } catch (error) {
          payload.logger.error({ err: error, msg: 'payload-forms: scheduled resend failed' })
        }
      })
      return data
    }
    const result = await resendFailedDeliveries(req.payload, submission, req)
    data.deliveryLog = result.log
    data.status = result.status
    return data
  }
}
