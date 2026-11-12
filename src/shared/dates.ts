/**
 * Date, time and date-time values of date questions (0.5.0). Values are wall-time text as HTML
 * inputs send them: Date `YYYY-MM-DD`, Time `HH:MM` (or `HH:MM:SS`), Date and time
 * `YYYY-MM-DDTHH:MM` (optional seconds, no zone). Only `Intl` is used for time zones (no
 * Temporal, no date library), so this runs the same in browsers, Workers and Node.
 */
import type { AnswerValue, InputBlock } from './types.js'

/** The relative choice of a date default or limit: "Today" (Date) or "Now" (Date and time, Time). */
export const TODAY = 'today'

/** The submit body field holding the visitor's IANA time zone. No field key can be `_tz`. */
export const TIME_ZONE_FIELD = '_tz'

export type DateMode = 'dayAndTime' | 'dayOnly' | 'timeOnly'
export type DateValueFormat = 'local' | 'utc'
export type DateDisplayStyle = 'asStored' | 'long' | 'medium' | 'short'

export const DATE_MODES: readonly DateMode[] = ['dayOnly', 'dayAndTime', 'timeOnly']
export const DATE_VALUE_FORMATS: readonly DateValueFormat[] = ['local', 'utc']
export const DATE_DISPLAY_STYLES: readonly DateDisplayStyle[] = ['asStored', 'short', 'medium', 'long']

/** Options for `today` limits and defaults: the moment and the zone to read it in. */
export type DateNow = {
  /** Default: the current moment. */
  now?: Date
  /** IANA zone. Default: the runtime's local zone. */
  timeZone?: string
}

/** What message builders pass to format dates: the message's language and the submission's zone. */
export type DateContext = {
  /** BCP 47 language of the message; one `Intl` refuses falls back to `en`. */
  locale?: null | string
  /** The submission's recorded zone, else the plugin's `timezone`. Default `UTC`. */
  timeZone?: null | string
}

type DateFieldLike = Pick<InputBlock, 'displayStyle' | 'maxDate' | 'minDate' | 'mode' | 'valueFormat'>

/** The question's mode; empty or unknown (a question saved before 0.5.0) is Date. */
export function dateMode(field: null | Partial<DateFieldLike> | undefined): DateMode {
  const mode = field?.mode
  return mode === 'dayAndTime' || mode === 'timeOnly' ? mode : 'dayOnly'
}

/** `utc` only for Date and time questions that opted in; everything else is kept as sent. */
export function dateValueFormat(field: null | Partial<DateFieldLike> | undefined): DateValueFormat {
  return dateMode(field) === 'dayAndTime' && field?.valueFormat === 'utc' ? 'utc' : 'local'
}

export function dateDisplayStyle(field: null | Partial<DateFieldLike> | undefined): DateDisplayStyle {
  const style = field?.displayStyle
  return style === 'short' || style === 'medium' || style === 'long' ? style : 'asStored'
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/

function validDay(y: number, m: number, d: number): boolean {
  const time = Date.UTC(y, m - 1, d)
  const back = new Date(time)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d
}

function validClock(h: number, mi: number, s: number): boolean {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59
}

/** A real calendar date as `YYYY-MM-DD`. */
export function isValidDate(value: unknown): value is string {
  const m = typeof value === 'string' ? DATE.exec(value) : null
  return Boolean(m) && validDay(Number(m![1]), Number(m![2]), Number(m![3]))
}

/** `HH:MM` or `HH:MM:SS`, 00:00 to 23:59. */
export function isValidTime(value: unknown): value is string {
  const m = typeof value === 'string' ? TIME.exec(value) : null
  return Boolean(m) && validClock(Number(m![1]), Number(m![2]), Number(m![3] ?? 0))
}

/** `YYYY-MM-DDTHH:MM` with optional seconds and no zone suffix, a real date and time. */
export function isValidDateTime(value: unknown): value is string {
  const m = typeof value === 'string' ? DATE_TIME.exec(value) : null
  return (
    Boolean(m) &&
    validDay(Number(m![1]), Number(m![2]), Number(m![3])) &&
    validClock(Number(m![4]), Number(m![5]), Number(m![6] ?? 0))
  )
}

/** A valid value of the mode (no `today`). */
export function isValidDateValue(value: unknown, mode: DateMode): value is string {
  if (mode === 'timeOnly') {
    return isValidTime(value)
  }
  return mode === 'dayAndTime' ? isValidDateTime(value) : isValidDate(value)
}

/** A date question's default: a value of its mode, or `today` ("Today" / "Now") in every mode. */
export function isDateDefaultValue(value: unknown, mode: DateMode): boolean {
  return value === TODAY || isValidDateValue(value, mode)
}

/** An Earliest or Latest: a value of its mode, or `today` except on a Time question. */
export function isDateLimitValue(value: unknown, mode: DateMode): boolean {
  return (value === TODAY && mode !== 'timeOnly') || isValidDateValue(value, mode)
}

/** The format words of a mode, for messages. */
export function dateFormatWords(mode: DateMode): string {
  return mode === 'timeOnly' ? 'HH:MM' : mode === 'dayAndTime' ? 'YYYY-MM-DDTHH:MM' : 'YYYY-MM-DD'
}

/** A value cut to minutes (seconds ignored), so values of one mode compare as text. */
export function comparableDateValue(value: string, mode: DateMode): string {
  if (mode === 'timeOnly') {
    return value.slice(0, 5)
  }
  return mode === 'dayAndTime' ? value.slice(0, 16) : value.slice(0, 10)
}

/** True when `zone` is an IANA time zone `Intl` accepts. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone.trim()) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The runtime's IANA time zone (in a browser: the visitor's). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

type WallParts = { d: number; h: number; m: number; mi: number; s: number; y: number }

const partsFormats = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock parts of `time` in `timeZone` (undefined: the runtime's local zone). */
function wallParts(time: number, timeZone?: string): WallParts {
  if (!timeZone) {
    const date = new Date(time)
    return {
      d: date.getDate(),
      h: date.getHours(),
      m: date.getMonth() + 1,
      mi: date.getMinutes(),
      s: date.getSeconds(),
      y: date.getFullYear(),
    }
  }
  let format = partsFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    })
    partsFormats.set(timeZone, format)
  }
  const out: Record<string, number> = {}
  for (const part of format.formatToParts(new Date(time))) {
    if (part.type !== 'literal') {
      out[part.type] = Number(part.value)
    }
  }
  return { d: out.day, h: out.hour === 24 ? 0 : out.hour, m: out.month, mi: out.minute, s: out.second, y: out.year }
}

function dayText(p: WallParts): string {
  return `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`
}

/** `today` as a value of the mode, at `now` in `timeZone` (default: the local zone). */
export function todayValue(mode: DateMode, { now = new Date(), timeZone }: DateNow = {}): string {
  const p = wallParts(now.getTime(), timeZone || undefined)
  const clock = `${pad(p.h)}:${pad(p.mi)}`
  if (mode === 'timeOnly') {
    return clock
  }
  return mode === 'dayAndTime' ? `${dayText(p)}T${clock}` : dayText(p)
}

/**
 * The concrete Earliest (`min`) or Latest (`max`) of a date question for an input's `min`/`max`:
 * the stored value, or `today` resolved at `now` in `timeZone` (Date and time: 00:00 for
 * Earliest, 23:59 for Latest). Null when there is none (or an invalid one).
 */
export function resolveDateLimit(field: Partial<DateFieldLike>, which: 'max' | 'min', ctx: DateNow = {}): null | string {
  const raw = which === 'min' ? field.minDate : field.maxDate
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) {
    return null
  }
  const mode = dateMode(field)
  if (value === TODAY) {
    if (mode === 'timeOnly') {
      return null
    }
    const day = todayValue('dayOnly', ctx)
    return mode === 'dayAndTime' ? `${day}T${which === 'min' ? '00:00' : '23:59'}` : day
  }
  if (mode === 'dayOnly') {
    const day = value.slice(0, 10)
    return isValidDate(day) ? day : null
  }
  return isValidDateValue(value, mode) ? comparableDateValue(value, mode) : null
}

function offsetAt(time: number, timeZone: string): number {
  const p = wallParts(time, timeZone)
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return wall - (time - (((time % 1000) + 1000) % 1000))
}

/**
 * The UTC instant (`toISOString` form) of a local date-time in `timeZone`. A time in a
 * spring-forward gap moves forward by the gap; an ambiguous fall-back time takes the earlier
 * instant (Temporal's `'compatible'`). Throws on a value that is not `YYYY-MM-DDTHH:MM[:SS]`.
 */
export function toUtcInstant(local: string, timeZone: string): string {
  const m = DATE_TIME.exec(local)
  if (!m || !isValidDateTime(local)) {
    throw new RangeError(`toUtcInstant: "${local}" is not YYYY-MM-DDTHH:MM.`)
  }
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  const day = 24 * 60 * 60 * 1000
  const before = offsetAt(wall - day, timeZone)
  const after = offsetAt(wall + day, timeZone)
  const candidates = [...new Set([after, before])]
    .map((offset) => wall - offset)
    .filter((time) => offsetAt(time, timeZone) === wall - time)
    .sort((a, b) => a - b)
  // None: the wall time falls in a gap; read it with the offset before the change (moves forward).
  const time = candidates.length ? candidates[0] : wall - before
  return new Date(time).toISOString()
}

/**
 * The value to store for one answer: a Date and time answer of a question stored as `utc`
 * becomes its UTC instant in `timeZone`; every other answer stays as sent.
 */
export function toStoredDateAnswer(field: InputBlock, value: AnswerValue, timeZone: string): AnswerValue {
  if (field.blockType !== 'date' || dateValueFormat(field) !== 'utc' || !isValidDateTime(value)) {
    return value
  }
  return toUtcInstant(value, timeZone)
}

function safeLocale(locale: null | string | undefined): string {
  if (!locale) {
    return 'en'
  }
  try {
    new Intl.DateTimeFormat(locale)
    return locale
  } catch {
    return 'en'
  }
}

/**
 * A date answer as messages show it: as stored (no style, or `asStored`), else through
 * `Intl.DateTimeFormat` in `locale`. Wall-time values are formatted from their own parts in UTC,
 * so no zone moves them; a UTC instant is shown in `timeZone` (default `UTC`) followed by the zone
 * name in brackets. A value that doesn't fit its mode is returned as stored.
 */
export function formatAnswerDate(value: unknown, field: Partial<DateFieldLike>, ctx: DateContext = {}): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  const style = dateDisplayStyle(field)
  if (style === 'asStored' || !text) {
    return text
  }
  const locale = safeLocale(ctx.locale)
  const mode = dateMode(field)
  if (mode === 'dayOnly') {
    const m = isValidDate(text) ? DATE.exec(text)! : null
    if (!m) {
      return text
    }
    const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(time)
  }
  if (mode === 'timeOnly') {
    const m = isValidTime(text) ? TIME.exec(text)! : null
    if (!m) {
      return text
    }
    const time = Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]))
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(time)
  }
  if (UTC_INSTANT.test(text) && !Number.isNaN(Date.parse(text))) {
    const zone = isTimeZone(ctx.timeZone) ? ctx.timeZone : 'UTC'
    const shown = new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: 'short', timeZone: zone }).format(Date.parse(text))
    return `${shown} (${zone})`
  }
  const m = isValidDateTime(text) ? DATE_TIME.exec(text)! : null
  if (!m) {
    return text
  }
  const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: 'short', timeZone: 'UTC' }).format(time)
}