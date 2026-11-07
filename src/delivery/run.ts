import type { Payload, PayloadRequest, SendEmailOptions } from 'payload'

import type { EmailOutput, FormDelivery, WebhookOutput } from '../server/forms.js'
import type { Answers, PublicForm, SnapshotRow, SubmissionStatus } from '../shared/types.js'
import type { ResolvedOptions } from '../types.js'

import { isValidEmail } from '../shared/answers.js'
import { buildMessageRows, buildTemplateValues, interpolate } from '../shared/tokens.js'
import { sendWebhook } from './webhook.js'

export type LogEntry = {
  at: string
  error?: null | string
  kind: 'email' | 'webhook'
  label?: null | string
  outputId?: null | string
  result: 'failed' | 'skipped' | 'success'
  target?: null | string
  tries?: null | number
}

export type DeliveryContext = {
  answers: Answers
  attachments?: Array<{ fieldKey: string; filename: string; id: number | string }>
  delivery: FormDelivery
  form: PublicForm
  options: ResolvedOptions
  payload: Payload
  req: PayloadRequest
  snapshot: SnapshotRow[]
  submissionId?: number | string
}

function addresses(value: null | string | undefined): string | undefined {
  const list = String(value || '')
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean)
  return list.length ? list.join(', ') : undefined
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sendOneEmail(ctx: DeliveryContext, output: EmailOutput): Promise<LogEntry> {
  const at = new Date().toISOString()
  const base = { at, kind: 'email' as const, label: output.label || null, outputId: output.id || null }
  let to: string | undefined
  if (output.kind === 'visitor') {
    const answer = ctx.answers[String(output.visitorField || '')]
    const address = typeof answer === 'string' ? answer.trim() : ''
    if (!isValidEmail(address)) {
      return {
        ...base,
        error: `Visitor copy not sent: "${address}" is not one valid email address.`,
        result: 'failed',
        target: address || null,
        tries: 0,
      }
    }
    to = address
  } else {
    to = addresses(output.to)
  }
  if (!to) {
    return { ...base, error: 'No address to send to.', result: 'failed', target: null, tries: 0 }
  }
  const rows = buildMessageRows(ctx.form, ctx.answers, ctx.options.fieldTypes)
  const values = buildTemplateValues(
    ctx.form,
    ctx.answers,
    { formTitle: ctx.form.title, submissionId: ctx.submissionId === undefined ? '' : String(ctx.submissionId) },
    ctx.options.fieldTypes,
  )
  const body = output.body || '{{*:table}}'
  const replyKey = String(output.replyToField || '')
  const replyTo = replyKey && isValidEmail(ctx.answers[replyKey]) ? String(ctx.answers[replyKey]).trim() : undefined
  let message: SendEmailOptions = {
    bcc: addresses(output.bcc),
    cc: addresses(output.cc),
    from: output.from?.trim() || undefined,
    html: interpolate(body.split('\n').join('<br>\n'), values, { html: true, rows }),
    replyTo,
    subject: interpolate(output.subject || 'New submission: {{formTitle}}', values, { singleLine: true }),
    text: interpolate(body, values, { rows }),
    to,
  }
  for (const key of Object.keys(message) as Array<keyof SendEmailOptions>) {
    if (message[key] === undefined) {
      delete message[key]
    }
  }
  try {
    if (ctx.options.beforeEmail) {
      message = await ctx.options.beforeEmail(message, { answers: ctx.answers, form: ctx.form, req: ctx.req })
    }
    await ctx.payload.sendEmail(message)
    return { ...base, result: 'success', target: to, tries: 1 }
  } catch (error) {
    return { ...base, error: errorText(error), result: 'failed', target: to, tries: 1 }
  }
}

async function sendOneWebhook(ctx: DeliveryContext, output: WebhookOutput): Promise<LogEntry> {
  const at = new Date().toISOString()
  const body =
    output.payloadMode === 'answersOnly'
      ? { answers: ctx.answers }
      : {
          answers: ctx.answers,
          form: { id: ctx.form.id, slug: ctx.form.slug, title: ctx.form.title },
          submission: {
            id: ctx.submissionId ?? null,
            attachments: ctx.attachments || [],
            snapshot: ctx.snapshot,
          },
        }
  const result = await sendWebhook(output, body)
  return {
    at,
    error: result.ok ? null : result.error || 'Webhook failed.',
    kind: 'webhook',
    label: output.label || null,
    outputId: output.id || null,
    result: result.ok ? 'success' : 'failed',
    target: output.url || null,
    tries: result.tries,
  }
}

/** Runs the enabled email and webhook outputs (or only `only`), each catching its own errors. */
export async function runDeliveries(ctx: DeliveryContext, only?: Set<string>): Promise<LogEntry[]> {
  const entries: LogEntry[] = []
  for (const output of ctx.delivery.emails) {
    if (output.enabled === false || (only && !only.has(String(output.id)))) {
      continue
    }
    entries.push(await sendOneEmail(ctx, output))
  }
  for (const output of ctx.delivery.webhooks) {
    if (output.enabled === false || (only && !only.has(String(output.id)))) {
      continue
    }
    try {
      entries.push(await sendOneWebhook(ctx, output))
    } catch (error) {
      entries.push({
        at: new Date().toISOString(),
        error: errorText(error),
        kind: 'webhook',
        label: output.label || null,
        outputId: output.id || null,
        result: 'failed',
        target: output.url || null,
        tries: 0,
      })
    }
  }
  return entries
}

export function hasDeliveries(delivery: FormDelivery): boolean {
  return delivery.emails.some((e) => e.enabled !== false) || delivery.webhooks.some((w) => w.enabled !== false)
}

/** The last entry of each output, ignoring outputs whose last entry is "skipped". */
export function lastResults(log: LogEntry[]): Map<string, LogEntry> {
  const last = new Map<string, LogEntry>()
  log.forEach((entry, index) => {
    last.set(entry.outputId || `#${index}`, entry)
  })
  for (const [key, entry] of last) {
    if (entry.result === 'skipped') {
      last.delete(key)
    }
  }
  return last
}

/** processed: all succeeded or none ran; partlyFailed: some failed; failed: all failed. */
export function statusFromLog(log: LogEntry[]): SubmissionStatus {
  const results = [...lastResults(log).values()]
  if (!results.length) {
    return 'processed'
  }
  const ok = results.filter((r) => r.result === 'success').length
  if (ok === results.length) {
    return 'processed'
  }
  return ok === 0 ? 'failed' : 'partlyFailed'
}
