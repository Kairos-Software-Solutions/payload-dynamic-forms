import type { Endpoint, PayloadRequest } from 'payload'

import { Buffer } from 'node:buffer'

import type { Answers, FileAnswer, FileLike, SubmitResult } from '../shared/types.js'
import type { ResolvedOptions } from '../types.js'

import { hasDeliveries, type LogEntry, runDeliveries, statusFromLog } from '../delivery/run.js'
import { checkRateLimit } from '../security/rateLimit.js'
import { getRequestIP, isHoneypotFilled } from '../security/request.js'
import { checkTurnstile } from '../security/turnstile.js'
import { loadPublishedForm } from '../server/forms.js'
import { buildSnapshot, checkAnswers } from '../shared/answers.js'
import { getFieldLabel, getInputFields } from '../shared/rules.js'
import { buildWhatsAppMessage, whatsappUrl } from '../shared/whatsapp.js'

type Raw = Record<string, unknown>

function respond(status: number, body: SubmitResult): Response {
  return Response.json(body, { status })
}

function isFile(value: unknown): value is File {
  return typeof value === 'object' && value !== null && typeof (value as Blob).arrayBuffer === 'function' && 'name' in value
}

async function parseBody(req: PayloadRequest): Promise<{ files: Record<string, File[]>; raw: Raw }> {
  const type = req.headers.get('content-type') || ''
  const raw: Raw = {}
  const files: Record<string, File[]> = {}
  if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
    const data = await req.formData!()
    for (const key of new Set(data.keys())) {
      const values = data.getAll(key)
      const fileValues = values.filter(isFile).filter((f) => f.size > 0)
      if (fileValues.length) {
        files[key] = fileValues
        continue
      }
      const text = values.filter((v): v is string => typeof v === 'string')
      raw[key] = text.length > 1 ? text : text[0]
    }
    return { files, raw }
  }
  const json = (await req.json!()) as unknown
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    Object.assign(raw, json)
  }
  return { files, raw }
}

/** `POST /api/<forms>/submit/:slug` — every check runs here, whatever the browser did. */
export function submitEndpoint(options: ResolvedOptions): Endpoint {
  return {
    handler: async (req) => {
      const payload = req.payload
      const slug = String(req.routeParams?.slug || '')
      const locale = (req.locale || undefined) as never
      const loaded = slug ? await loadPublishedForm(payload, slug, { locale, req }) : null
      if (!loaded) {
        return respond(404, { message: options.words.notFound, ok: false })
      }
      const { delivery, form } = loaded
      const words = form.wording
      if (form.intakeState === 'closed') {
        return respond(409, { message: words.closed, ok: false })
      }

      let body: Awaited<ReturnType<typeof parseBody>>
      try {
        body = await parseBody(req)
      } catch {
        return respond(400, { message: words.genericError, ok: false })
      }
      const { files, raw } = body
      const ip = getRequestIP(req.headers)

      if (form.spamChecks) {
        if (isHoneypotFilled(raw, options.honeypotField)) {
          return respond(400, { message: words.genericError, ok: false })
        }
        const human = await checkTurnstile({
          ip,
          logger: payload.logger,
          settings: options.turnstile,
          token: raw[options.turnstile.fieldName],
        })
        if (!human) {
          return respond(400, { message: words.securityCheckFailed, ok: false })
        }
        if (options.rateLimit) {
          const allowed = await checkRateLimit({
            formId: form.id,
            ip,
            max: options.rateLimit.max,
            payload,
            windowSeconds: options.rateLimit.windowSeconds,
          })
          if (!allowed) {
            return respond(429, { message: words.tooManyTries, ok: false })
          }
        }
      }

      const fileLikes: Record<string, FileLike[]> = {}
      for (const [key, list] of Object.entries(files)) {
        fileLikes[key] = list.map((f) => ({ name: f.name, type: f.type, size: f.size }))
      }
      const checked = checkAnswers(form, raw, {
        fieldTypes: options.fieldTypes,
        files: fileLikes,
        limits: options.attachments || undefined,
        words,
      })
      if (!checked.ok) {
        return respond(400, { fieldErrors: checked.fieldErrors, message: words.errorPrefix, ok: false })
      }
      const answers: Answers = checked.answers

      let waUrl: string | undefined
      if (delivery.whatsapp.enabled) {
        const number = form.whatsapp?.number
        if (!number) {
          payload.logger.error(`payload-dynamic-forms: form "${form.slug}" has WhatsApp on but no number (form or whatsapp.number).`)
          return respond(500, { message: words.genericError, ok: false })
        }
        const message = buildWhatsAppMessage(form, answers, {
          fieldTypes: options.fieldTypes,
          rowTemplate: delivery.whatsapp.rowTemplate,
          template: delivery.whatsapp.messageTemplate,
        })
        waUrl = whatsappUrl(number, message)
      }

      const inputs = new Map(getInputFields(form).map((entry) => [entry.key, entry]))
      const visibleUploads = checked.fileKeys.map((key) => inputs.get(key)!).filter(Boolean)

      let submissionId: number | string | undefined
      let snapshot = buildSnapshot(form, answers, options.fieldTypes)
      const created: Array<{ fieldKey: string; filename: string; id: number | string }> = []
      const outputs = hasDeliveries(delivery)

      if (delivery.store) {
        const attachmentSlug = options.attachments?.collection
        try {
          for (const { field, key } of visibleUploads) {
            for (const file of files[key]) {
              const doc = await payload.create({
                collection: attachmentSlug as never,
                data: { fieldKey: key, fieldLabel: getFieldLabel(field, key), form: form.id } as never,
                file: {
                  name: file.name || 'upload',
                  data: Buffer.from(await file.arrayBuffer()),
                  mimetype: file.type || 'application/octet-stream',
                  size: file.size,
                },
                overrideAccess: true,
              })
              const filename = String((doc as { filename?: string }).filename || file.name)
              created.push({ id: doc.id, fieldKey: key, filename })
              const prev = answers[key] as FileAnswer | undefined
              answers[key] = {
                attachmentIds: [...(prev?.attachmentIds || []), doc.id],
                filenames: [...(prev?.filenames || []), filename],
              }
            }
          }
          snapshot = buildSnapshot(form, answers, options.fieldTypes)
          const submission = await payload.create({
            collection: options.slugs.submissions as never,
            data: {
              answers,
              attachments: created.map((c) => c.id),
              deliveryLog: [],
              form: form.id,
              metadata: {
                ip: options.metadata.ip ? ip || null : null,
                locale: req.locale || null,
                userAgent: options.metadata.userAgent ? req.headers.get('user-agent') || null : null,
              },
              snapshot,
              status: outputs ? 'received' : 'processed',
            } as never,
            overrideAccess: true,
          })
          submissionId = submission.id
          for (const file of created) {
            await payload.update({
              id: file.id,
              collection: attachmentSlug as never,
              data: { submission: submissionId } as never,
              overrideAccess: true,
            })
          }
        } catch (error) {
          payload.logger.error({ err: error, msg: `payload-dynamic-forms: could not store a submission of "${form.slug}"` })
          for (const file of created) {
            try {
              await payload.delete({ id: file.id, collection: attachmentSlug as never, overrideAccess: true })
            } catch (deleteError) {
              payload.logger.error({ err: deleteError, msg: 'payload-dynamic-forms: could not remove an attachment' })
            }
          }
          return respond(500, { message: words.genericError, ok: false })
        }
      }

      if (outputs) {
        const task = async () => {
          try {
            const entries: LogEntry[] = await runDeliveries({
              answers,
              attachments: created,
              delivery,
              form,
              options,
              payload,
              req,
              snapshot,
              submissionId,
            })
            for (const entry of entries.filter((e) => e.result === 'failed')) {
              payload.logger.error(`payload-dynamic-forms: ${entry.kind} "${entry.label}" of "${form.slug}" failed: ${entry.error}`)
            }
            if (submissionId !== undefined) {
              await payload.update({
                id: submissionId,
                collection: options.slugs.submissions as never,
                data: { deliveryLog: entries, status: statusFromLog(entries) } as never,
                overrideAccess: true,
              })
            }
          } catch (error) {
            payload.logger.error({ err: error, msg: `payload-dynamic-forms: delivery of "${form.slug}" failed` })
          }
        }
        if (options.delivery?.schedule) {
          options.delivery.schedule(task)
        } else {
          await task()
        }
      }

      const result: SubmitResult = { message: words.success, ok: true }
      if (form.successType === 'redirect' && form.successRedirectURL) {
        result.redirectURL = form.successRedirectURL
      }
      if (submissionId !== undefined) {
        result.submissionId = submissionId
      }
      if (waUrl) {
        result.whatsappUrl = waUrl
      }
      return respond(200, result)
    },
    method: 'post',
    path: '/submit/:slug',
  }
}
