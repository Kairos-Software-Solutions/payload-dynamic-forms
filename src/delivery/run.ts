import type { Payload, PayloadRequest, SendEmailOptions, TypedLocale } from 'payload'

import type { EmailOutput, FormDelivery, LoadedForm, WebhookOutput } from '../server/forms.js'
import type { Answers, PublicForm, SnapshotRow, SubmissionStatus } from '../shared/types.js'
import type { ResolvedOptions, WebhookConfigArgs, WebhookConfigValue } from '../types.js'

import { loadFormById } from '../server/forms.js'
import { isValidEmail } from '../shared/answers.js'
import { buildMessageRows, buildTemplateValues, interpolate } from '../shared/tokens.js'
import { sendWebhook, webhookMessageId } from './webhook.js'

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
  /** The submission's locale (the one `form` was read in); none without localization. */
  locale?: TypedLocale
  options: ResolvedOptions
  payload: Payload
  req: PayloadRequest
  snapshot: SnapshotRow[]
  submissionId?: number | string
}

/** The words an email is written from: the form read in one locale and that read's output. */
type EmailWords = { form: PublicForm; locale?: TypedLocale; output: EmailOutput }

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

async function sendOneEmail(ctx: DeliveryContext, output: EmailOutput, words: EmailWords): Promise<LogEntry> {
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
  // Labels, Yes/No, the title, subject and body come from the form read in the email's language.
  const { form } = words
  const rows = buildMessageRows(form, ctx.answers, ctx.options.fieldTypes)
  const values = buildTemplateValues(
    form,
    ctx.answers,
    { formTitle: form.title, submissionId: ctx.submissionId === undefined ? '' : String(ctx.submissionId) },
    ctx.options.fieldTypes,
  )
  const body = words.output.body || '{{*:table}}'
  const replyKey = String(output.replyToField || '')
  const replyTo = replyKey && isValidEmail(ctx.answers[replyKey]) ? String(ctx.answers[replyKey]).trim() : undefined
  let message: SendEmailOptions = {
    bcc: addresses(output.bcc),
    cc: addresses(output.cc),
    from: output.from?.trim() || undefined,
    html: interpolate(body.split('\n').join('<br>\n'), values, { html: true, rows }),
    replyTo,
    subject: interpolate(words.output.subject || 'New submission: {{formTitle}}', values, { singleLine: true }),
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
      message = await ctx.options.beforeEmail(message, { answers: ctx.answers, form, locale: words.locale, req: ctx.req })
    }
    await ctx.payload.sendEmail(message)
    return { ...base, result: 'success', target: to, tries: 1 }
  } catch (error) {
    return { ...base, error: errorText(error), result: 'failed', target: to, tries: 1 }
  }
}

/** Webhooks already warned about being unsigned in this server process (form id + output id). */
const warnedUnsigned = new Set<string>()

export const NO_SECRET_ERROR = 'Webhook not sent: no signing secret.'

async function configValue<T>(value: undefined | WebhookConfigValue<T>, args: WebhookConfigArgs): Promise<T | undefined> {
  return typeof value === 'function'
    ? await (value as (args: WebhookConfigArgs) => Promise<T | undefined> | T | undefined)(args)
    : value
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The webhook's admin secret when non-empty, else the config one (value or function). */
async function resolveSigningSecret(ctx: DeliveryContext, output: WebhookOutput, args: WebhookConfigArgs): Promise<string | undefined> {
  return nonEmpty(output.signingSecret) ?? nonEmpty(await configValue(ctx.options.webhooks?.signingSecret, args))
}

async function sendOneWebhook(ctx: DeliveryContext, output: WebhookOutput): Promise<LogEntry> {
  const at = new Date().toISOString()
  const base = { at, kind: 'webhook' as const, label: output.label || null, outputId: output.id || null, target: output.url || null }
  const args: WebhookConfigArgs = {
    form: ctx.form,
    req: ctx.req,
    webhook: { id: output.id || null, label: output.label || null, url: String(output.url || '') },
  }
  const signingSecret = await resolveSigningSecret(ctx, output, args)
  if (!signingSecret) {
    if (ctx.options.webhooks?.requireSignature) {
      return { ...base, error: NO_SECRET_ERROR, result: 'failed', tries: 0 }
    }
    const key = `${String(ctx.form.id)}:${output.id ?? output.url ?? ''}`
    if (!warnedUnsigned.has(key)) {
      warnedUnsigned.add(key)
      ctx.payload?.logger?.warn(
        `payload-dynamic-forms: webhook "${output.label || ''}" on form "${ctx.form.slug}" is sent unsigned; set a signing secret.`,
      )
    }
  }
  const configHeaders = (await configValue(ctx.options.webhooks?.headers, args)) || null
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
  // Stable for a stored submission (retries and resends); random once per delivery otherwise.
  const webhookId = webhookMessageId(ctx.submissionId, output.id)
  const result = await sendWebhook({ ...output, configHeaders, signingSecret, webhookId }, body)
  return {
    ...base,
    error: result.ok ? null : result.error || 'Webhook failed.',
    result: result.ok ? 'success' : 'failed',
    tries: result.tries,
  }
}

/**
 * The words of one email: a visitor copy in the submission's language, a team email in the app's
 * default locale. The default-locale form is read once per run, only when it differs from the
 * submission's; when that read fails or lacks the output, the submission-locale words are used.
 */
function emailWords(ctx: DeliveryContext): (output: EmailOutput) => Promise<EmailWords> {
  const own = (output: EmailOutput): EmailWords => ({ form: ctx.form, locale: ctx.locale, output })
  let teamForm: Promise<LoadedForm | null> | undefined
  return async (output) => {
    const localization = ctx.payload?.config?.localization
    const defaultLocale = localization ? (localization.defaultLocale as TypedLocale) : undefined
    if (output.kind === 'visitor' || !defaultLocale || ctx.locale === defaultLocale) {
      return own(output)
    }
    teamForm ??= loadFormById(ctx.payload, ctx.form.id, { locale: defaultLocale, req: ctx.req }).catch(() => null)
    const loaded = await teamForm
    const match = loaded && output.id ? loaded.delivery.emails.find((e) => e.id === output.id) : undefined
    return loaded && match ? { form: loaded.form, locale: defaultLocale, output: match } : own(output)
  }
}

/** Runs the enabled email and webhook outputs (or only `only`), each catching its own errors. */
export async function runDeliveries(ctx: DeliveryContext, only?: Set<string>): Promise<LogEntry[]> {
  const entries: LogEntry[] = []
  const wordsFor = emailWords(ctx)
  for (const output of ctx.delivery.emails) {
    if (output.enabled === false || (only && !only.has(String(output.id)))) {
      continue
    }
    entries.push(await sendOneEmail(ctx, output, await wordsFor(output)))
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
