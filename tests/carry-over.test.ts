import { describe, expect, test } from 'vitest'

import { carryOverDefault, rollbackDefault } from '../src/index.js'

describe('carry-over', () => {
  test('0.4.0 defaults that fit are carried over', () => {
    const cases = [
      { args: { blockType: 'select', defaultLocale: 'en', options: ['yes', 'no'], values: { en: ' no ', es: 'no' } }, value: 'no' },
      { args: { blockType: 'date', defaultLocale: 'en', values: { en: '2026-12-01' } }, value: '2026-12-01' },
      { args: { blockType: 'number', defaultLocale: 'en', max: 10, min: 1, values: { en: '5' } }, value: '5' },
      { args: { blockType: 'email', defaultLocale: 'en', values: { en: 'team@example.com' } }, value: 'team@example.com' },
      { args: { blockType: 'select', defaultLocale: 'en', sourceValues: ['cameras', 'tripods'], values: { en: 'cameras' } }, value: 'cameras' },
    ]
    for (const { args, value } of cases) {
      expect(carryOverDefault(args), args.blockType).toEqual({ report: [], value })
    }
    // Nothing to carry: no value and nothing to report.
    expect(carryOverDefault({ blockType: 'radio', defaultLocale: 'en', options: ['a', 'b'], values: { en: null, es: '' } })).toEqual({ report: [], value: null })
  })

  test("0.4.0 defaults that don't fit are reported, not carried", () => {
    const misfits = [
      { blockType: 'radio', defaultLocale: 'en', options: ['a', 'b'], values: { en: 'Yes please' } },
      { blockType: 'date', defaultLocale: 'en', values: { en: 'next week' } },
      { blockType: 'number', defaultLocale: 'en', max: 10, values: { en: '20' } },
      { blockType: 'email', defaultLocale: 'en', values: { en: 'n/a' } },
    ]
    for (const args of misfits) {
      const result = carryOverDefault(args)
      expect(result.value, args.blockType).toBeNull()
      expect(result.report, args.blockType).toHaveLength(1)
      expect(result.report[0], args.blockType).toContain(`"${args.values.en}"`)
      expect(result.report[0], args.blockType).toMatch(/not carried: .+/)
    }
    expect(carryOverDefault(misfits[2]).report[0]).toContain('maximum 10')
    const differs = carryOverDefault({ blockType: 'select', defaultLocale: 'en', options: ['a', 'b'], values: { en: 'a', es: 'b' } })
    expect(differs.value).toBe('a')
    expect(differs.report).toHaveLength(1)
    expect(differs.report[0]).toMatch(/^es: "b"/)
    const unchecked = carryOverDefault({ blockType: 'select', defaultLocale: 'en', values: { en: 'cameras' } })
    expect(unchecked.value).toBe('cameras')
    expect(unchecked.report).toEqual(['en: "cameras" carried, not checked against the collection.'])
  })

  test('0.5.0 values are put back in a form 0.4.0 can read', () => {
    expect(rollbackDefault({ blockType: 'select', value: 'no' })).toEqual({ maxDate: null, minDate: null, report: [], value: 'no' })
    expect(rollbackDefault({ blockType: 'number', value: '12' })).toEqual({ maxDate: null, minDate: null, report: [], value: '12' })
    const limits = rollbackDefault({ blockType: 'date', maxDate: '2027-01-31', minDate: 'today', value: '2026-12-01' })
    expect(limits).toMatchObject({ maxDate: '2027-01-31', minDate: null, value: '2026-12-01' })
    expect(limits.report).toHaveLength(1)
    expect(limits.report[0]).toContain('Earliest "today"')
    const today = rollbackDefault({ blockType: 'date', value: 'today' })
    expect(today).toMatchObject({ maxDate: null, minDate: null, value: null })
    expect(today.report).toEqual([expect.stringContaining('Default "today"')])
    const dateTime = rollbackDefault({ blockType: 'date', maxDate: '2026-12-31T18:00', value: '2026-12-01T09:00' })
    expect(dateTime).toMatchObject({ maxDate: null, minDate: null, value: null })
    expect(dateTime.report).toEqual([expect.stringContaining('Default "2026-12-01T09:00"'), expect.stringContaining('Latest "2026-12-31T18:00"')])
    const time = rollbackDefault({ blockType: 'date', minDate: '09:00', value: '09:30' })
    expect(time).toMatchObject({ maxDate: null, minDate: null, value: null })
    expect(time.report).toEqual([expect.stringContaining('Default "09:30"'), expect.stringContaining('Earliest "09:00"')])
  })
})
