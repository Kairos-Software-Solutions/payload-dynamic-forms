/**
 * The 0.5.0 rules for a question's default and date limits (design 5), shared by the save hook
 * and the sites' upgrade helpers. Pure: the caller reads any source collection and passes its
 * values in. Each check returns the reason a value doesn't fit, or null when it fits.
 */
import type { InputBlock } from './types.js'

import { isValidEmail } from './answers.js'
import {
  comparableDateValue,
  dateFormatWords,
  dateMode,
  isDateDefaultValue,
  isDateLimitValue,
  TODAY,
} from './dates.js'
import { getOptions, toStringList } from './rules.js'

/** No default: null, undefined, an empty or blank text, an empty list. */
export function isEmptyDefault(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim() === ''
  }
  return Array.isArray(value) && value.length === 0
}

/** A number default as a number: a finite number, or text holding one; else NaN. */
export function numberDefault(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  return typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN
}

export type DefaultCheckOptions = {
  /**
   * Choices from a collection: the values (`valueField`) the default may take, read by the
   * caller (the picked items, else every item). Undefined: not checked against the collection.
   */
  sourceValues?: string[]
}

function isSourced(field: InputBlock): boolean {
  return Boolean(field.optionsFrom && field.optionsFrom !== 'typed')
}

/** The reason `value` doesn't fit as the question's default, or null (empty always fits). */
export function defaultProblem(field: InputBlock, value: unknown, options: DefaultCheckOptions = {}): null | string {
  if (isEmptyDefault(value)) {
    return null
  }
  switch (field.blockType) {
    case 'checkboxGroup':
    case 'radio':
    case 'select': {
      const allowed = isSourced(field) ? options.sourceValues : getOptions(field).map((o) => String(o.value))
      if (!allowed) {
        return null
      }
      const listed = new Set(allowed)
      const values = field.blockType === 'checkboxGroup' ? toStringList(value) : [String(value).trim()]
      const outside = values.filter((v) => !listed.has(v))
      if (!outside.length) {
        return null
      }
      const where = isSourced(field) ? 'the chosen items' : 'the options'
      return outside.length === 1 ? `"${outside[0]}" is not one of ${where}.` : `${outside.map((v) => `"${v}"`).join(', ')} are not among ${where}.`
    }
    case 'date': {
      const mode = dateMode(field)
      return typeof value === 'string' && isDateDefaultValue(value.trim(), mode)
        ? null
        : `"${String(value)}" is not a date in ${dateFormatWords(mode)} or today.`
    }
    case 'email':
      return isValidEmail(value) ? null : `"${String(value)}" is not one valid email address.`
    case 'number': {
      const n = numberDefault(value)
      if (!Number.isFinite(n)) {
        return `"${String(value)}" is not a number.`
      }
      if (typeof field.min === 'number' && n < field.min) {
        return `${n} is below the minimum ${field.min}.`
      }
      if (typeof field.max === 'number' && n > field.max) {
        return `${n} is above the maximum ${field.max}.`
      }
      return null
    }
    case 'text':
    case 'textarea': {
      const length = [...String(value)].length
      if (typeof field.maxLength === 'number' && field.maxLength > 0 && length > field.maxLength) {
        return `the default is ${length} characters long; the maximum length is ${field.maxLength}.`
      }
      if (typeof field.minLength === 'number' && field.minLength > 0 && length < field.minLength) {
        return `the default is ${length} characters long; the minimum length is ${field.minLength}.`
      }
      return null
    }
    default:
      return null
  }
}

export type LimitProblem = { name: 'maxDate' | 'minDate'; reason: string }

/** Earliest and Latest of a date question: each in the mode (or `today`, not on Time), in order. */
export function dateLimitProblems(field: InputBlock): LimitProblem[] {
  const mode = dateMode(field)
  const out: LimitProblem[] = []
  const fixed: Partial<Record<'maxDate' | 'minDate', string>> = {}
  for (const [name, label] of [
    ['minDate', 'Earliest'],
    ['maxDate', 'Latest'],
  ] as const) {
    const raw = field[name]
    if (isEmptyDefault(raw)) {
      continue
    }
    const value = String(raw).trim()
    if (!isDateLimitValue(value, mode)) {
      out.push({
        name,
        reason:
          mode === 'timeOnly'
            ? `${label} "${value}" is not a time in ${dateFormatWords(mode)}${value === TODAY ? ' (a time limit has no "now")' : ''}.`
            : `${label} "${value}" is not a date in ${dateFormatWords(mode)} or today.`,
      })
    } else if (value !== TODAY) {
      fixed[name] = comparableDateValue(value, mode)
    }
  }
  if (fixed.minDate && fixed.maxDate && fixed.minDate > fixed.maxDate) {
    out.push({ name: 'minDate', reason: `Earliest (${fixed.minDate}) is after Latest (${fixed.maxDate}).` })
  }
  return out
}
