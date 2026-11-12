import { describe, expect, test } from 'vitest'

import {
  defaultAnswer,
  evaluateRow,
  evaluateRules,
  type FormLike,
  getVisibility,
  initialAnswers,
  type InputBlock,
  isFieldVisible,
  OPERATORS,
  type OperatorValue,
} from '../src/exports/shared.js'
import { input, topicForm } from './fixtures/forms.js'

describe('rule engine', () => {
  test('all needs every row, any needs one', () => {
    const rows = [
      { fieldKey: 'a', operator: 'equals' as const, value: 'yes' },
      { fieldKey: 'b', operator: 'equals' as const, value: 'yes' },
    ]
    const answers = { a: 'yes', b: 'no' }
    expect(evaluateRules({ match: 'any', rows }, answers)).toBe(true)
    expect(evaluateRules({ match: 'all', rows }, answers)).toBe(false)
    expect(evaluateRules({ rows }, answers)).toBe(false)
    expect(evaluateRules({ rows: [] }, answers)).toBe(true)
    expect(evaluateRules(undefined, answers)).toBe(true)
  })

  test('each operator matches and rejects', () => {
    const cases: Array<[OperatorValue, unknown, unknown, string]> = [
      ['equals', 'web', 'print', 'web'],
      ['notEquals', 'print', 'web', 'web'],
      ['contains', 'Big website', 'Small app', 'web'],
      ['notContains', 'Small app', 'Big website', 'web'],
      ['hasValue', 'x', '', ''],
      ['notHasValue', '', 'x', ''],
      ['greaterThan', 5000, 500, '1000'],
      ['greaterThan', '2026-05-02', '2026-04-30', '2026-05-01'],
      ['lessThan', 3, 30, '10'],
      ['lessThan', '2026-04-30', '2026-05-02', '2026-05-01'],
      ['includesOption', ['red', 'blue'], ['green'], 'blue'],
    ]
    for (const [operator, match, miss, value] of cases) {
      const row = { fieldKey: 'q', operator, value }
      expect(evaluateRow(row, { q: match as never }), `${operator} should match ${String(match)}`).toBe(true)
      expect(evaluateRow(row, { q: miss as never }), `${operator} should reject ${String(miss)}`).toBe(false)
    }
    // An empty answer and an unchecked checkbox count as no value; a checkbox-group list too.
    expect(evaluateRow({ fieldKey: 'q', operator: 'hasValue' }, { q: false })).toBe(false)
    expect(evaluateRow({ fieldKey: 'q', operator: 'notHasValue' }, { q: [] })).toBe(true)
    expect(evaluateRow({ fieldKey: 'q', operator: 'hasValue' }, { q: ['a'] })).toBe(true)
    expect(evaluateRow({ fieldKey: 'q', operator: 'greaterThan', value: '10' }, { q: '' })).toBe(false)
    // Every listed operator is covered above.
    const covered = new Set(cases.map((c) => c[0]))
    expect(OPERATORS.map((o) => o.value).filter((v) => !covered.has(v))).toEqual([])
    expect(OPERATORS).toHaveLength(9)
  })

  test('hidden section hides its fields', () => {
    const form: FormLike = {
      sections: [
        { fields: [input('radio', 'kind', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] })], key: 'one' },
        {
          fields: [input('text', 'plain'), input('text', 'ruled', { visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'hasValue' }] } })],
          key: 'two',
          visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'equals', value: 'b' }] },
        },
      ],
    }
    const answers = { kind: 'a', plain: 'x', ruled: 'y' }
    const [, two] = form.sections!
    expect(isFieldVisible(two, two.fields![0], answers, form)).toBe(false)
    expect(isFieldVisible(two, two.fields![1], answers, form)).toBe(false)
    const visibility = getVisibility(form, answers)
    expect([...visibility.fieldKeys]).toEqual(['kind'])
    expect(visibility.answers).toEqual({ kind: 'a' })
    expect([...getVisibility(form, { ...answers, kind: 'b' }).fieldKeys]).toEqual(['kind', 'plain', 'ruled'])
  })

  test("rules read the chosen option's attributes", () => {
    const form = topicForm()
    const item = getVisibility(form, { name: 'Ana', need: 'cameras' })
    expect(item.sectionKeys).toEqual(['start', 'item-set'])
    expect(item.fieldKeys.has('item')).toBe(true)
    expect(item.fieldKeys.has('service-detail')).toBe(false)
    const service = getVisibility(form, { name: 'Ana', need: 'lens-cleaning' })
    expect(service.sectionKeys).toEqual(['start', 'service-set'])
    expect(service.fieldKeys.has('item')).toBe(false)
    expect(service.fieldKeys.has('service-detail')).toBe(true)
  })

  test('prefill uses listed values from the link', () => {
    const form = topicForm()
    const need = form.sections![0].fields![1] as { defaultValue?: string }
    need.defaultValue = 'tripods'
    expect(initialAnswers(form, new URLSearchParams('need=cameras')).need).toBe('cameras')
    expect(initialAnswers(form, '?need=unknown').need).toBe('tripods')
    expect(initialAnswers(form, { need: 'cameras' }).need).toBe('cameras')
    expect(initialAnswers(form).need).toBe('tripods')
    // Inputs without a link parameter keep their defaults.
    expect(initialAnswers(form, '?name=Ana').name).toBe('')
  })

  test('today defaults resolve when the form starts', () => {
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('date', 'day', { defaultValue: 'today', mode: 'dayOnly' }),
            input('date', 'when', { defaultValue: 'today', mode: 'dayAndTime' }),
            input('date', 'time', { defaultValue: 'today', mode: 'timeOnly' }),
            input('date', 'old', { defaultValue: 'today', mode: null }),
            input('date', 'fixed', { defaultValue: '2026-12-01' }),
          ],
          key: 'one',
        },
      ],
    }
    const now = new Date(2026, 10, 12, 14, 30, 20)
    expect(initialAnswers(form, undefined, { now })).toEqual({
      day: '2026-11-12',
      fixed: '2026-12-01',
      old: '2026-11-12',
      time: '14:30',
      when: '2026-11-12T14:30',
    })
    expect(defaultAnswer(form.sections![0].fields![1] as InputBlock, { now })).toBe('2026-11-12T14:30')
  })

  test('choice defaults outside the options start empty', () => {
    const options = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ]
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('radio', 'radio-key', { defaultValue: 'gone', options, prefillParam: 'radio-key' }),
            input('select', 'pick', { defaultValue: 'b', options }),
            input('checkboxGroup', 'many', { defaultValue: 'a,gone', options }),
          ],
          key: 'one',
        },
      ],
    }
    expect(initialAnswers(form)).toEqual({ many: ['a'], pick: 'b', 'radio-key': '' })
    expect(initialAnswers(form, '?radio-key=a')['radio-key']).toBe('a')
    expect(initialAnswers(form, '?radio-key=gone')['radio-key']).toBe('')
  })

  test('number defaults start as numbers', () => {
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('number', 'count', { defaultValue: '12' }),
            input('number', 'ratio', { defaultValue: '1.5' }),
            input('number', 'none', { defaultValue: null }),
            input('number', 'bad', { defaultValue: 'many' }),
          ],
          key: 'one',
        },
      ],
    }
    const answers = initialAnswers(form)
    expect(answers.count).toBe(12)
    expect(answers.ratio).toBe(1.5)
    expect(answers.none).toBe('')
    expect(answers.bad).toBe('')
  })
})
