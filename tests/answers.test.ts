import { describe, expect, test } from 'vitest'

import {
  answerToText,
  buildMessageRows,
  buildSnapshot,
  buildTemplateValues,
  buildWhatsAppMessage,
  checkAnswers,
  DEFAULT_WORDS,
  type FormLike,
  interpolate,
  normalizeAnswer,
  resolveDateLimit,
  WORD_KEYS,
} from '../src/exports/shared.js'
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

  test("checkbox answers use the form's yes and no words", () => {
    // Defaults are words like every other, so they reach the Form wording fields (localized).
    expect(DEFAULT_WORDS.yes).toBe('Yes')
    expect(DEFAULT_WORDS.no).toBe('No')
    expect(WORD_KEYS).toEqual(expect.arrayContaining(['yes', 'no']))

    const fields = [
      input('checkbox', 'agree', { words: { label: 'Agree', rowLabel: 'Agrees' } }),
      input('checkbox', 'news', { words: { label: 'News', rowLabel: 'Newsletter' } }),
    ]
    const answers = { agree: true, news: false }
    const form = (wording?: FormLike['wording']): FormLike => ({ sections: [{ fields, key: 's' }], title: 'T', wording })

    // An older form without the words falls back to the defaults. Rows and the snapshot list
    // answered fields only (an unticked box is no answer); tokens carry both words.
    expect(buildSnapshot(form(), answers).map((r) => r.value)).toEqual(['Yes'])
    expect(buildTemplateValues(form(), answers)).toMatchObject({ agree: 'Yes', news: 'No' })

    const spanish = form({ no: 'No (es)', yes: 'Sí' })
    // Snapshot (stored, and the webhook body).
    expect(buildSnapshot(spanish, answers)).toEqual([{ fieldKey: 'agree', label: 'Agree', sectionKey: 's', sectionTitle: 's', value: 'Sí' }])
    // Email rows and tokens.
    const rows = buildMessageRows(spanish, answers)
    expect(rows).toEqual([{ key: 'agree', label: 'Agrees', value: 'Sí' }])
    const values = buildTemplateValues(spanish, answers)
    expect(values).toMatchObject({ agree: 'Sí', news: 'No (es)' })
    expect(interpolate('{{agree}}/{{news}}\n{{*}}', values, { rows })).toBe('Sí/No (es)\nAgrees: Sí')
    // WhatsApp.
    expect(buildWhatsAppMessage(spanish, answers, { template: 'News: {{news}}\n{{*}}' })).toBe('News: No (es)\n*Agrees:* Sí')
    // Direct calls read the words they are given; an empty word is filled like the others.
    expect(answerToText(fields[0], true, { no: 'Nein', yes: 'Ja' })).toBe('Ja')
    expect(answerToText(fields[0], false, { no: 'Nein', yes: 'Ja' })).toBe('Nein')
    expect(buildTemplateValues(form({ no: '', yes: '  ' }), answers)).toMatchObject({ agree: 'Yes', news: 'No' })
    // A registered type's toText gets the same words.
    const custom = { checkbox: { toText: (v: unknown, _f: unknown, w: { no: string; yes: string }) => (v ? `+${w.yes}` : `-${w.no}`) } }
    expect(buildTemplateValues(spanish, answers, {}, custom)).toMatchObject({ agree: '+Sí', news: '-No (es)' })
  })

  test('date mode accepts calendar dates as sent', () => {
    const form = oneField(input('date', 'day', { minDate: '2026-11-01', mode: 'dayOnly' }))
    const ok = checkAnswers(form, { day: ' 2026-11-12 ' })
    expect(ok.ok).toBe(true)
    expect(ok.answers.day).toBe('2026-11-12')
    for (const bad of ['2026-02-30', '12/11/2026', '2026-10-31']) {
      const result = checkAnswers(form, { day: bad })
      expect(result.ok, bad).toBe(false)
      expect(result.fieldErrors.day, bad).toBe('day is not valid.')
    }
  })

  test('a date question without a mode is a Date question', () => {
    for (const mode of [null, undefined, 'dayOnly'] as const) {
      const form = oneField(input('date', 'day', { mode }))
      const ok = checkAnswers(form, { day: '2026-11-12' })
      expect(ok.ok, String(mode)).toBe(true)
      expect(ok.answers.day, String(mode)).toBe('2026-11-12')
      expect(checkAnswers(form, { day: '14:30' }).fieldErrors.day, String(mode)).toBe('day is not valid.')
    }
  })

  test('time mode accepts times within its limits', () => {
    const form = oneField(input('date', 'slot', { maxDate: '17:00', minDate: '09:00', mode: 'timeOnly' }))
    for (const good of ['14:30', '14:30:15', '09:00', '17:00']) {
      const result = checkAnswers(form, { slot: good })
      expect(result.ok, good).toBe(true)
      expect(result.answers.slot, good).toBe(good)
    }
    for (const bad of ['08:59', '24:00', '2:30 pm', '17:01', '2026-11-12']) {
      expect(checkAnswers(form, { slot: bad }).ok, bad).toBe(false)
    }
  })

  test('date and time mode accepts local date-times within its limits', () => {
    const form = oneField(input('date', 'when', { maxDate: '2026-12-31T18:00', mode: 'dayAndTime' }))
    for (const good of ['2026-11-12T14:30', '2026-11-12T14:30:05']) {
      const result = checkAnswers(form, { when: good })
      expect(result.ok, good).toBe(true)
      expect(result.answers.when, good).toBe(good)
    }
    for (const bad of ['2026-11-12T14:30Z', '2026-11-12', '2027-01-01T09:00', '2026-11-31T10:00', '2026-11-12T25:00']) {
      expect(checkAnswers(form, { when: bad }).ok, bad).toBe(false)
    }
  })

  test("today limits resolve in the visitor's time zone", () => {
    const now = new Date('2026-11-12T03:00:00Z')
    const day = input('date', 'day', { minDate: 'today' })
    const form = oneField(day)
    const ny = { now, timeZone: 'America/New_York' }
    expect(checkAnswers(form, { day: '2026-11-11' }, ny).ok).toBe(true)
    expect(checkAnswers(form, { day: '2026-11-10' }, ny).ok).toBe(false)
    expect(checkAnswers(form, { day: '2026-11-11' }, { now, timeZone: 'UTC' }).ok).toBe(false)
    expect(checkAnswers(form, { day: '2026-11-12' }, { now, timeZone: 'UTC' }).ok).toBe(true)
    expect(resolveDateLimit(day, 'min', ny)).toBe('2026-11-11')
    expect(resolveDateLimit(day, 'min', { now, timeZone: 'UTC' })).toBe('2026-11-12')
    expect(resolveDateLimit(day, 'max', ny)).toBeNull()

    const when = input('date', 'when', { maxDate: 'today', minDate: 'today', mode: 'dayAndTime' })
    const both = oneField(when)
    for (const good of ['2026-11-11T00:00', '2026-11-11T23:59']) {
      expect(checkAnswers(both, { when: good }, ny).ok, good).toBe(true)
    }
    for (const bad of ['2026-11-10T23:59', '2026-11-12T00:00']) {
      expect(checkAnswers(both, { when: bad }, ny).ok, bad).toBe(false)
    }
    expect(resolveDateLimit(when, 'min', ny)).toBe('2026-11-11T00:00')
    expect(resolveDateLimit(when, 'max', ny)).toBe('2026-11-11T23:59')
    // A Time question's limits have no today.
    expect(resolveDateLimit(input('date', 'slot', { minDate: 'today', mode: 'timeOnly' }), 'min', ny)).toBeNull()
  })
})
