/**
 * For the `down()` of a site's 0.5.0 migration (design 18): the default and date limits in a form
 * 0.4.0 can read. Pure and Workers-safe: the migration reads the rows, calls this per question
 * and writes the result back.
 */
import { isValidDate, TODAY } from '../shared/dates.js'

export type RollbackArgs = {
  blockType: string
  /** Date questions: Earliest and Latest as 0.5.0 stored them. */
  maxDate?: null | string
  minDate?: null | string
  /** The 0.5.0 default. */
  value?: null | string
}

export type RollbackResult = {
  maxDate: null | string
  minDate: null | string
  /** One line per value dropped. */
  report: string[]
  value: null | string
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function why(value: string): string {
  if (value === TODAY) {
    return '0.4.0 has no "today"'
  }
  return /T/.test(value) ? '0.4.0 has no date and time' : /^\d{2}:\d{2}/.test(value) ? '0.4.0 has no time' : '0.4.0 reads only YYYY-MM-DD'
}

/**
 * Email, number, select and radio defaults as stored (trimmed); a date default, Earliest and
 * Latest only as `YYYY-MM-DD` (0.4.0 compares limits as text, so `today` would refuse every date,
 * and it reads every date question as Date), else null with a report line.
 */
export function rollbackDefault(args: RollbackArgs): RollbackResult {
  const report: string[] = []
  const value = trimmed(args.value)
  if (args.blockType !== 'date') {
    return { maxDate: trimmed(args.maxDate) || null, minDate: trimmed(args.minDate) || null, report, value: value || null }
  }
  const keep = (text: string, label: string): null | string => {
    if (!text) {
      return null
    }
    // (Not narrowed: an invalid text is still a string.)
    if (isValidDate(text)) {
      return text
    }
    report.push(`${label} "${text}" dropped: ${why(text)}.`)
    return null
  }
  // In this order, so the report reads default, Earliest, Latest.
  const kept = keep(value, 'Default')
  const minDate = keep(trimmed(args.minDate), 'Earliest')
  const maxDate = keep(trimmed(args.maxDate), 'Latest')
  return { maxDate, minDate, report, value: kept }
}