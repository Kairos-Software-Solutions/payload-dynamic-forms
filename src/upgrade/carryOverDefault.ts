/**
 * For a site's 0.5.0 upgrade migration (design 18): which 0.4.0 default to copy into the
 * question's new, non-localized default column. Pure and Workers-safe: no database or Payload
 * access; the migration reads the rows, calls this per question and writes the result.
 */
import type { InputBlock } from '../shared/types.js'

import { type DateMode, dateMode } from '../shared/dates.js'
import { defaultProblem, isEmptyDefault } from '../shared/defaults.js'

export type CarryOverArgs = {
  /** The question's block type (email, number, date, select, radio). */
  blockType: string
  /** The app's default locale: its value is the one carried. */
  defaultLocale: string
  /** Number questions: Min and Max. */
  max?: null | number
  min?: null | number
  /** Date questions: the mode (0.4.0 rows: none, which is Date). */
  mode?: DateMode | null
  /** Select and radio with typed options: the option values. Leave out for choices from a collection. */
  options?: string[]
  /** Choices from a collection: the values the default may take. Leave out when not read. */
  sourceValues?: string[]
  /** The 0.4.0 localized defaults, by locale code. */
  values: Record<string, null | string | undefined>
}

export type CarryOverResult = {
  /** One line per value not carried (or carried unchecked); empty when everything fits. */
  report: string[]
  /** The value for the new column, or null. */
  value: null | string
}

const CHOICE = new Set(['radio', 'select'])

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The default-locale value (trimmed) when it fits the 0.5.0 rules for its type, else null; every
 * value it doesn't carry is reported, never dropped silently: a default-locale value that doesn't
 * fit, and another locale's value that differs from the carried one.
 */
export function carryOverDefault(args: CarryOverArgs): CarryOverResult {
  const { blockType, defaultLocale, values } = args
  const report: string[] = []
  const candidate = trimmed(values[defaultLocale])
  let value: null | string = null
  if (candidate) {
    const fromCollection = CHOICE.has(blockType) && !args.options
    const field: InputBlock = {
      blockType,
      max: args.max ?? null,
      min: args.min ?? null,
      mode: blockType === 'date' ? dateMode({ mode: args.mode }) : null,
      options: (args.options || []).map((v) => ({ label: v, value: v })),
      optionsFrom: fromCollection ? 'source' : null,
    }
    if (fromCollection && !args.sourceValues) {
      value = candidate
      report.push(`${defaultLocale}: "${candidate}" carried, not checked against the collection.`)
    } else {
      const problem = defaultProblem(field, candidate, { sourceValues: args.sourceValues })
      if (problem) {
        report.push(`${defaultLocale}: "${candidate}" not carried: ${problem}`)
      } else {
        value = candidate
      }
    }
  }
  for (const [locale, raw] of Object.entries(values)) {
    if (locale === defaultLocale || isEmptyDefault(raw)) {
      continue
    }
    const other = trimmed(raw)
    if (other !== value) {
      report.push(
        value === null
          ? `${locale}: "${other}" not carried: only the ${defaultLocale} default is carried, and it has none that fits.`
          : `${locale}: "${other}" not carried: differs from the ${defaultLocale} default "${value}", which is used in every language.`,
      )
    }
  }
  return { report, value }
}
