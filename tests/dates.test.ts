import { describe, expect, test } from 'vitest'

import {
  browserTimeZone,
  formatAnswerDate,
  type InputBlock,
  normalizeKey,
  TIME_ZONE_FIELD,
  TODAY,
  toStoredDateAnswer,
  toUtcInstant,
} from '../src/exports/shared.js'
import { input } from './fixtures/forms.js'

const utc = (iso: string) => Date.parse(iso)

describe('dates', () => {
  test('local date-times convert to utc across daylight saving changes', () => {
    expect(toUtcInstant('2026-11-12T14:30', 'Europe/Madrid')).toBe('2026-11-12T13:30:00.000Z')
    // Spring forward: 02:30 does not exist in New York on 8 Mar 2026; it moves forward by the gap.
    expect(toUtcInstant('2026-03-08T02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z')
    // Fall back: 01:30 happens twice on 1 Nov 2026; the earlier instant (EDT) is taken.
    expect(toUtcInstant('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z')
    expect(toUtcInstant('2026-11-12T14:30', 'America/New_York')).toBe('2026-11-12T19:30:00.000Z')
    expect(toUtcInstant('2026-11-12T14:30:45', 'UTC')).toBe('2026-11-12T14:30:45.000Z')
    expect(toUtcInstant('2026-12-01T00:15', 'Pacific/Auckland')).toBe('2026-11-30T11:15:00.000Z')
    expect(() => toUtcInstant('2026-11-12', 'UTC')).toThrow(RangeError)
  })

  test('date-only and time-only answers are never converted', () => {
    const zone = 'America/New_York'
    const day = input('date', 'day', { mode: 'dayOnly', valueFormat: 'utc' })
    const time = input('date', 'time', { mode: 'timeOnly', valueFormat: 'utc' })
    const old = input('date', 'old', { mode: null, valueFormat: 'utc' })
    const local = input('date', 'local', { mode: 'dayAndTime', valueFormat: 'local' })
    const stored = input('date', 'stored', { mode: 'dayAndTime', valueFormat: 'utc' })
    expect(toStoredDateAnswer(day, '2026-11-12', zone)).toBe('2026-11-12')
    expect(toStoredDateAnswer(time, '14:30', zone)).toBe('14:30')
    expect(toStoredDateAnswer(old, '2026-11-12', zone)).toBe('2026-11-12')
    expect(toStoredDateAnswer(local, '2026-11-12T14:30', zone)).toBe('2026-11-12T14:30')
    expect(toStoredDateAnswer(stored, '2026-11-12T14:30', zone)).toBe('2026-11-12T19:30:00.000Z')
    expect(toStoredDateAnswer(stored, '', zone)).toBe('')
    expect(toStoredDateAnswer(input('text', 'x', { valueFormat: 'utc' }), '2026-11-12T14:30', zone)).toBe('2026-11-12T14:30')
  })

  test('time zone field and helpers are exported', () => {
    expect(TIME_ZONE_FIELD).toBe('_tz')
    expect(normalizeKey('_tz')).not.toBe('_tz')
    expect(browserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(TODAY).toBe('today')
  })

  test('dates read as stored unless a style is set', () => {
    const plain = input('date', 'day')
    expect(formatAnswerDate('2026-11-12', plain, { locale: 'en' })).toBe('2026-11-12')
    expect(formatAnswerDate('2026-11-12', { ...plain, displayStyle: 'asStored' }, { locale: 'es' })).toBe('2026-11-12')
    const medium: InputBlock = { ...plain, displayStyle: 'medium' }
    for (const locale of ['en', 'es']) {
      const expected = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(utc('2026-11-12T00:00:00Z'))
      expect(formatAnswerDate('2026-11-12', medium, { locale }), locale).toBe(expected)
    }
    // A locale Intl refuses falls back to en.
    const en = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(utc('2026-11-12T00:00:00Z'))
    expect(formatAnswerDate('2026-11-12', medium, { locale: 'not a locale!' })).toBe(en)
    expect(formatAnswerDate('2026-11-12', medium)).toBe(en)
    // A value that doesn't fit stays as stored.
    expect(formatAnswerDate('soon', medium, { locale: 'en' })).toBe('soon')
  })

  test('wall-time dates never shift with the time zone', () => {
    const ctx = { locale: 'en', timeZone: 'Pacific/Auckland' }
    const time = input('date', 'time', { displayStyle: 'short', mode: 'timeOnly' })
    const expectedTime = new Intl.DateTimeFormat('en', { timeStyle: 'short', timeZone: 'UTC' }).format(utc('1970-01-01T14:30:00Z'))
    expect(formatAnswerDate('14:30', time, ctx)).toBe(expectedTime)
    const when = input('date', 'when', { displayStyle: 'long', mode: 'dayAndTime' })
    const expectedWhen = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(utc('2026-11-12T23:30:00Z'))
    expect(formatAnswerDate('2026-11-12T23:30', when, ctx)).toBe(expectedWhen)
    expect(expectedWhen).toContain('12')
    expect(expectedWhen).toContain('2026')
    expect(expectedWhen).toMatch(/11:30|23:30/)
    // The zone changes nothing for wall-time values.
    expect(formatAnswerDate('2026-11-12T23:30', when, { locale: 'en', timeZone: 'America/New_York' })).toBe(expectedWhen)
  })

  test("utc date-times read in the visitor's zone with its name", () => {
    const field = input('date', 'when', { displayStyle: 'medium', mode: 'dayAndTime', valueFormat: 'utc' })
    const instant = '2026-11-12T19:30:00.000Z'
    const ny = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(utc(instant))
    expect(formatAnswerDate(instant, field, { locale: 'en', timeZone: 'America/New_York' })).toBe(`${ny} (America/New_York)`)
    expect(ny).toMatch(/2:30/)
    const inUtc = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(utc(instant))
    expect(formatAnswerDate(instant, field, { locale: 'en', timeZone: 'UTC' })).toBe(`${inUtc} (UTC)`)
    expect(formatAnswerDate(instant, field, { locale: 'en' })).toBe(`${inUtc} (UTC)`)
    expect(inUtc).toMatch(/7:30/)
    // As stored without a style.
    expect(formatAnswerDate(instant, { ...field, displayStyle: null }, { timeZone: 'America/New_York' })).toBe(instant)
  })
})
