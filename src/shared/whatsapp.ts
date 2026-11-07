import type { Answers, FieldTypeChecks, FormLike } from './types.js'

import { buildMessageRows, buildTemplateValues, interpolate, type TokenValue } from './tokens.js'

export const DEFAULT_WHATSAPP_TEMPLATE = '{{*}}'
export const DEFAULT_WHATSAPP_ROW_TEMPLATE = '*{{label}}:* {{value}}'

export type WhatsAppMessageOptions = {
  extra?: Record<string, TokenValue>
  fieldTypes?: Record<string, FieldTypeChecks>
  /** Row format for `{{*}}`; tokens `{{label}}` and `{{value}}`. Default `*{{label}}:* {{value}}`. */
  rowTemplate?: null | string
  /** Message template. Default `{{*}}`. */
  template?: null | string
}

/**
 * The WhatsApp message for these answers: the template with `{{*}}` as one row per answered,
 * shown field (row labels), `{{key}}` and `{{key.attribute}}` tokens. Empty lines left by empty
 * tokens are collapsed.
 */
export function buildWhatsAppMessage(
  form: FormLike,
  answers: Answers,
  options: WhatsAppMessageOptions = {},
): string {
  const rowTemplate = options.rowTemplate?.trim() ? options.rowTemplate : DEFAULT_WHATSAPP_ROW_TEMPLATE
  const template = options.template?.trim() ? options.template : DEFAULT_WHATSAPP_TEMPLATE
  const rows = buildMessageRows(form, answers, options.fieldTypes)
  const star = rows.map((row) => interpolate(rowTemplate, { label: row.label, value: row.value })).join('\n')
  const values = buildTemplateValues(form, answers, options.extra, options.fieldTypes)
  const withRows = template.replace(/\{\{\s*\*(?::table)?\s*\}\}/g, () => '\u0000ROWS\u0000')
  const filled = interpolate(withRows, values).split('\u0000ROWS\u0000').join(star)
  return filled
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** `https://wa.me/<digits>?text=<message encoded with encodeURIComponent>`. */
export function whatsappUrl(number: null | string | undefined, message: string): string {
  const digits = String(number ?? '').replace(/\D+/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
