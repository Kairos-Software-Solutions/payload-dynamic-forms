/**
 * Date picker values ↔ wall-time text (no React here, so it is unit-tested on its own).
 *
 * `@payloadcms/ui`'s `DatePicker` hands a Date-mode (`dayOnly`) pick over as 12:00 UTC of the
 * picked day (`setHours(12 - tzOffset)`), so Date mode reads it with the UTC getters, which holds
 * from UTC-12 to UTC+14. Date and time and Time picks stay as picked, in local time, so those read
 * with the local getters. Back the other way, every mode builds a local `Date`: Date mode at 12:00
 * of the stored day, so the picker shows that day in any zone.
 */
import { type DateMode, isValidDate, isValidDateTime, isValidTime, TODAY } from '../shared/dates.js'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** The text a pick stores in the mode: `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM` or `HH:MM`. */
export function pickToText(date: Date | null | undefined, mode: DateMode): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  if (mode === 'dayOnly') {
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (mode === 'timeOnly') {
    return clock
  }
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${clock}`
}

/**
 * The picker value for stored text in the mode, or undefined (empty, `today`, or text that
 * doesn't fit the mode). A Time value takes the date of `base` (default: now).
 */
export function textToPick(text: unknown, mode: DateMode, base: Date = new Date()): Date | undefined {
  if (typeof text !== 'string' || !text || text === TODAY) {
    return undefined
  }
  if (mode === 'dayOnly') {
    if (!isValidDate(text)) {
      return undefined
    }
    const [y, m, d] = text.split('-').map(Number)
    return new Date(y, m - 1, d, 12)
  }
  if (mode === 'timeOnly') {
    if (!isValidTime(text)) {
      return undefined
    }
    const [h, mi] = text.split(':').map(Number)
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, mi)
  }
  if (!isValidDateTime(text)) {
    return undefined
  }
  const [day, clock] = text.split('T')
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = clock.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi)
}

/** What the picker gets per mode: the year always shown, a 24-hour clock in 15-minute steps. */
export const PICKER_PROPS: Record<
  DateMode,
  { displayFormat: string; pickerAppearance: DateMode; timeFormat?: string; timeIntervals?: number }
> = {
  dayAndTime: { displayFormat: 'yyyy-MM-dd HH:mm', pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm', timeIntervals: 15 },
  dayOnly: { displayFormat: 'yyyy-MM-dd', pickerAppearance: 'dayOnly' },
  timeOnly: { displayFormat: 'HH:mm', pickerAppearance: 'timeOnly', timeFormat: 'HH:mm', timeIntervals: 15 },
}

/** The words of the relative choice: "Today" for dates, "Now" with a time. */
export function relativeWord(mode: DateMode): string {
  return mode === 'dayOnly' ? 'Today' : 'Now'
}
