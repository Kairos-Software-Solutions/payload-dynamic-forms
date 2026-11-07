import type { Answers, FieldTypeChecks, FormLike, InputBlock } from './types.js'

import { answerToText } from './answers.js'
import { getInputFields, getOptions, getRowLabel, hasAnswer, isChoiceBlock, toStringList } from './rules.js'
import { getVisibility } from './steps.js'

export type TokenValue = boolean | null | number | string | undefined

export type MessageRow = { key: string; label: string; value: string }

export type InterpolateOptions = {
  /** Escape values for HTML and turn `{{*}}` lines into `<br>`. */
  html?: boolean
  /** Rows for `{{*}}` and `{{*:table}}`. */
  rows?: MessageRow[]
  /** Remove line breaks (for subjects and headers). */
  singleLine?: boolean
}

const TOKEN = /\{\{\s*(\*(?::table)?|[A-Za-z0-9_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)?)\s*\}\}/g

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rowsAsLines(rows: MessageRow[], html: boolean): string {
  const lines = rows.map((row) => `${row.label}: ${row.value}`)
  return html ? lines.map(escapeHtml).join('<br>\n') : lines.join('\n')
}

function rowsAsTable(rows: MessageRow[], html: boolean): string {
  if (!html) {
    return rowsAsLines(rows, false)
  }
  const body = rows
    .map((row) => `<tr><th align="left">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

/**
 * Fills `{{key}}` (dashes and underscores allowed), `{{key.attribute}}`, `{{*}}` and
 * `{{*:table}}`. Unknown tokens become empty.
 */
export function interpolate(
  template: null | string | undefined,
  values: Record<string, TokenValue>,
  options: InterpolateOptions = {},
): string {
  if (!template) {
    return ''
  }
  const html = Boolean(options.html)
  const out = template.replace(TOKEN, (_match, name: string) => {
    if (name === '*') {
      return rowsAsLines(options.rows || [], html)
    }
    if (name === '*:table') {
      return rowsAsTable(options.rows || [], html)
    }
    const value = values[name]
    const text = value === undefined || value === null ? '' : String(value)
    return html ? escapeHtml(text) : text
  })
  return options.singleLine ? out.replace(/[\r\n]+/g, ' ').trim() : out
}

/** One row per answered, shown field, in form order, using each field's row label. */
export function buildMessageRows(
  form: FormLike,
  answers: Answers,
  fieldTypes?: Record<string, FieldTypeChecks>,
): MessageRow[] {
  const { answers: shown } = getVisibility(form, answers)
  const rows: MessageRow[] = []
  for (const { field, key } of getInputFields(form)) {
    if (!(key in shown) || !hasAnswer(shown[key])) {
      continue
    }
    const value = answerToText(field, shown[key]!, fieldTypes)
    if (!value.trim()) {
      continue
    }
    rows.push({ key, label: getRowLabel(field, key), value })
  }
  return rows
}

function chosenAttributes(field: InputBlock, value: unknown): Record<string, string> {
  const options = getOptions(field)
  const chosen = toStringList(value)
    .map((v) => options.find((o) => String(o.value) === v))
    .filter(Boolean)
  const out: Record<string, string> = {}
  for (const option of chosen) {
    for (const [name, attr] of Object.entries(option!.attributes || {})) {
      if (attr === null || attr === undefined) {
        continue
      }
      out[name] = out[name] ? `${out[name]}, ${String(attr)}` : String(attr)
    }
  }
  return out
}

/** Token values for a form's shown answers: `{{key}}`, `{{key.attribute}}` plus `extra`. */
export function buildTemplateValues(
  form: FormLike,
  answers: Answers,
  extra: Record<string, TokenValue> = {},
  fieldTypes?: Record<string, FieldTypeChecks>,
): Record<string, TokenValue> {
  const { answers: shown } = getVisibility(form, answers)
  const values: Record<string, TokenValue> = { formTitle: form.title || '', ...extra }
  for (const { field, key } of getInputFields(form)) {
    if (!(key in shown)) {
      continue
    }
    values[key] = answerToText(field, shown[key]!, fieldTypes)
    if (isChoiceBlock(field)) {
      for (const [name, attr] of Object.entries(chosenAttributes(field, shown[key]))) {
        values[`${key}.${name}`] = attr
      }
    }
  }
  return values
}
