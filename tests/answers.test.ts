import { describe, expect, test } from 'vitest'

import { checkAnswers, type FormLike, normalizeAnswer } from '../src/exports/shared.js'
import { input } from './fixtures/forms.js'

function oneField(field: ReturnType<typeof input>, extra: FormLike = {}): FormLike {
  return { sections: [{ fields: [field], key: 's' }], ...extra }
}

describe('answer checks', () => {
  test('required counts only while visible', () => {
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('checkbox', 'wants-call'),
            input('text', 'phone', { required: true, visibilityRules: { rows: [{ fieldKey: 'wants-call', operator: 'equals', value: 'true' }] } }),
          ],
          key: 's',
        },
      ],
    }
    expect(checkAnswers(form, { 'wants-call': '' }).fieldErrors).toEqual({})
    expect(checkAnswers(form, { 'wants-call': 'on' }).fieldErrors).toEqual({ phone: 'phone is required.' })
  })

  test('answers to hidden fields are dropped', () => {
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('select', 'kind', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
            input('text', 'b-detail', { visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'equals', value: 'b' }] } }),
          ],
          key: 's',
        },
      ],
    }
    const result = checkAnswers(form, { 'b-detail': 'sneaky', extra: 'not a field', kind: 'a' })
    expect(result.ok).toBe(true)
    expect(result.answers).toEqual({ kind: 'a' })
  })

  test('email must be one valid address', () => {
    const form = oneField(input('email', 'email', { words: { errorInvalid: 'Use one email address.', label: 'Email' } }))
    for (const bad of ['a@b', 'a b@c.com', 'a@b.com, c@d.com']) {
      expect(checkAnswers(form, { email: bad }).fieldErrors, bad).toEqual({ email: 'Use one email address.' })
    }
    expect(checkAnswers(form, { email: 'name@example.com' }).fieldErrors).toEqual({})
  })

  test('number, date and length limits', () => {
    const number = oneField(input('number', 'count', { max: 10, min: 1, words: { errorInvalid: 'Pick 1 to 10.', label: 'Count' } }))
    for (const bad of ['0', '11', 'x']) {
      expect(checkAnswers(number, { count: bad }).fieldErrors, bad).toEqual({ count: 'Pick 1 to 10.' })
    }
    expect(checkAnswers(number, { count: '5' })).toMatchObject({ answers: { count: 5 }, fieldErrors: {} })

    const date = oneField(input('date', 'day', { maxDate: '2026-12-31', minDate: '2026-01-01', words: { errorInvalid: 'Pick a 2026 date.', label: 'Day' } }))
    expect(checkAnswers(date, { day: '2027-01-05' }).fieldErrors).toEqual({ day: 'Pick a 2026 date.' })
    expect(checkAnswers(date, { day: '2026-02-30' }).fieldErrors).toEqual({ day: 'Pick a 2026 date.' })
    expect(checkAnswers(date, { day: '2026-06-01' }).fieldErrors).toEqual({})

    const text = oneField(input('text', 'code', { maxLength: 5, words: { label: 'Code' } }), {
      wording: { invalid: '{{label}} is too long.' },
    })
    expect(checkAnswers(text, { code: 'abcdef' }).fieldErrors).toEqual({ code: 'Code is too long.' })
    expect(checkAnswers(text, { code: 'abcde' }).fieldErrors).toEqual({})
  })

  test('choices must be listed options', () => {
    const options = [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
      { label: 'Green', value: 'green' },
    ]
    const radio = oneField(input('radio', 'colour', { options }))
    expect(checkAnswers(radio, { colour: 'pink' }).fieldErrors).toEqual({ colour: 'colour is not valid.' })
    expect(checkAnswers(radio, { colour: 'red' }).fieldErrors).toEqual({})

    const group = oneField(input('checkboxGroup', 'colours', { options }))
    expect(checkAnswers(group, { colours: ['red', 'blue', 'pink'] }).fieldErrors).toEqual({ colours: 'colours is not valid.' })
    expect(checkAnswers(group, { colours: ['red', 'blue'] })).toMatchObject({ answers: { colours: ['red', 'blue'] }, fieldErrors: {} })
  })

  test('checkbox values normalise to booleans', () => {
    const box = input('checkbox', 'agree', { required: true, words: { errorEmpty: 'Please agree.', label: 'Agree' } })
    for (const yes of ['on', 'true', '1', 'yes']) {
      expect(normalizeAnswer(box, yes), yes).toBe(true)
    }
    for (const no of ['false', undefined, '']) {
      expect(normalizeAnswer(box, no), String(no)).toBe(false)
    }
    const form = oneField(box)
    expect(checkAnswers(form, { agree: 'false' }).fieldErrors).toEqual({ agree: 'Please agree.' })
    expect(checkAnswers(form, {}).fieldErrors).toEqual({ agree: 'Please agree.' })
    expect(checkAnswers(form, { agree: 'on' })).toMatchObject({ answers: { agree: true }, fieldErrors: {} })
  })
})
