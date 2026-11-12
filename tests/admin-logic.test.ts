import { describe, expect, test } from 'vitest'

import { PICKER_PROPS, pickToText, textToPick } from '../src/admin/dateText.js'
import {
  fieldKeyOptions,
  joinRuleKey,
  sectionIndexOf,
  sectionKeyOptions,
  siblingPath,
  skippedSectionsWithShowRules,
  splitStoredRuleKey,
} from '../src/admin/formKeys.js'
import { caretAfterFormat, formatKeyInput } from '../src/admin/keys.js'
import { formRowText, jumpRowText, optionRowText, questionRowText, ruleRowText, sectionRowText } from '../src/admin/rowText.js'
import { normalizeKey } from '../src/shared/rules.js'

const state = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { value }]))

describe('admin logic', () => {
  test('key formatter matches normalizeKey', () => {
    const cases: [string, string][] = [
      [' Project Type', 'project-type'],
      ['Project_Type!', 'project-type-'],
      ['--a  b--', 'a-b-'],
      ['Ñame 2', 'ame-2'],
    ]
    for (const [raw, formatted] of cases) {
      expect(formatKeyInput(raw), raw).toBe(formatted)
      expect(formatKeyInput(raw).replace(/-$/, ''), raw).toBe(normalizeKey(raw))
    }
    for (const raw of ['', 'already-fine', 'UPPER', 'a.b', '  ', 'x--y', '9 lives ', 'café au lait']) {
      expect(formatKeyInput(raw).replace(/-$/, ''), raw).toBe(normalizeKey(raw))
      // Formatting twice changes nothing.
      expect(formatKeyInput(formatKeyInput(raw)), raw).toBe(formatKeyInput(raw))
    }
  })

  test('caret stays after the typed characters', () => {
    const raw = 'Project Type'
    const formatted = formatKeyInput(raw)
    const caret = caretAfterFormat(raw, 'Project T'.length)
    expect(caret).toBe('project-t'.length)
    expect(formatted.slice(0, caret)).toBe('project-t')
    // Typing a space in the middle of a word: the caret sits after the new dash.
    expect(caretAfterFormat('project type', 'project '.length)).toBe('project-'.length)
    // Editing mid-word in an already formatted key.
    expect(caretAfterFormat('projXect-type', 'projX'.length)).toBe('projx'.length)
    // Ends and out-of-range values.
    expect(caretAfterFormat(raw, 0)).toBe(0)
    expect(caretAfterFormat(raw, raw.length)).toBe(formatted.length)
    expect(caretAfterFormat(raw, 99)).toBe(formatted.length)
    expect(caretAfterFormat('  a', 2)).toBe(0)
  })

  test('field key options: inputs only, normalised, once, in form order', () => {
    const options = fieldKeyOptions(
      state({
        'sections.0.fields.0.blockType': 'heading',
        'sections.0.fields.0.fieldKey': 'not-a-question',
        'sections.0.fields.1.blockType': 'text',
        'sections.0.fields.1.fieldKey': 'name',
        'sections.0.fields.2.blockType': 'radio',
        'sections.0.fields.2.fieldKey': 'Need',
        'sections.0.fields.2.optionsFrom': 'topics',
        'sections.0.fields.10.blockType': 'text',
        'sections.0.fields.10.fieldKey': 'later',
        'sections.1.fields.0.blockType': 'select',
        'sections.1.fields.0.fieldKey': 'size',
        'sections.1.fields.0.optionsFrom': 'typed',
        'sections.1.fields.1.blockType': 'email',
        'sections.1.fields.1.fieldKey': 'NAME',
        'sections.1.fields.2.blockType': 'text',
        'sections.1.fields.2.fieldKey': '',
        'sections.1.key': 'second',
      }),
    )
    expect(options).toEqual([
      { hasAttributes: false, key: 'name' },
      { hasAttributes: true, key: 'need' },
      { hasAttributes: false, key: 'later' },
      { hasAttributes: false, key: 'size' },
    ])
  })

  test('section key options leave out the own section', () => {
    const s = state({ 'sections.0.key': 'About', 'sections.1.key': 'details', 'sections.2.key': 'done', 'sections.3.key': '' })
    expect(sectionKeyOptions(s, 1)).toEqual(['about', 'done'])
    expect(sectionKeyOptions(s)).toEqual(['about', 'details', 'done'])
  })

  test('path and rule key helpers', () => {
    expect(sectionIndexOf('sections.2.nextStepRules.0.targetSectionKey')).toBe(2)
    expect(sectionIndexOf('title')).toBeUndefined()
    expect(siblingPath('sections.0.fields.1.prefillParam', 'fieldKey')).toBe('sections.0.fields.1.fieldKey')
    expect(splitStoredRuleKey('need.fieldSet')).toEqual({ attribute: 'fieldSet', key: 'need' })
    expect(splitStoredRuleKey('need')).toEqual({ attribute: '', key: 'need' })
    expect(splitStoredRuleKey(null)).toEqual({ attribute: '', key: '' })
    expect(joinRuleKey('need', ' fieldSet ')).toBe('need.fieldSet')
    expect(joinRuleKey('need', '')).toBe('need')
  })

  test('date picker values convert to wall-time text both ways', () => {
    // Date mode: the picker hands a pick over as 12:00 UTC of the picked day; read in UTC.
    expect(pickToText(new Date('2026-12-01T12:00:00.000Z'), 'dayOnly')).toBe('2026-12-01')
    const day = textToPick('2026-12-01', 'dayOnly')!
    expect([day.getFullYear(), day.getMonth() + 1, day.getDate(), day.getHours()]).toEqual([2026, 12, 1, 12])
    expect(pickToText(new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12)), 'dayOnly')).toBe('2026-12-01')
    // Date and time and Time: local getters and the local constructor, both ways.
    expect(pickToText(new Date(2026, 11, 1, 9, 5), 'dayAndTime')).toBe('2026-12-01T09:05')
    const dateTime = textToPick('2026-12-01T09:05', 'dayAndTime')!
    expect([dateTime.getFullYear(), dateTime.getMonth() + 1, dateTime.getDate(), dateTime.getHours(), dateTime.getMinutes()]).toEqual([2026, 12, 1, 9, 5])
    expect(pickToText(new Date(2026, 11, 1, 23, 45), 'timeOnly')).toBe('23:45')
    const time = textToPick('23:45', 'timeOnly', new Date(2026, 10, 12, 8))!
    expect([time.getFullYear(), time.getMonth() + 1, time.getDate(), time.getHours(), time.getMinutes()]).toEqual([2026, 11, 12, 23, 45])
    // Round trips.
    for (const [text, mode] of [['2027-01-31', 'dayOnly'], ['2026-03-08T02:30', 'dayAndTime'], ['00:00', 'timeOnly']] as const) {
      expect(pickToText(textToPick(text, mode), mode === 'dayOnly' ? 'dayAndTime' : mode).slice(0, text.length), text).toBe(
        mode === 'dayOnly' ? `${text}T12:00`.slice(0, text.length) : text,
      )
    }
    // Nothing to pick: empty, today, or text of another mode.
    for (const [text, mode] of [['', 'dayOnly'], ['today', 'dayOnly'], ['today', 'timeOnly'], ['14:30', 'dayOnly'], ['2026-12-01', 'timeOnly'], ['2026-12-01', 'dayAndTime'], [null, 'dayOnly']] as const) {
      expect(textToPick(text, mode), `${String(text)} ${mode}`).toBeUndefined()
    }
    expect(pickToText(null, 'dayOnly')).toBe('')
    expect(PICKER_PROPS.dayOnly).toEqual({ displayFormat: 'yyyy-MM-dd', pickerAppearance: 'dayOnly' })
    expect(PICKER_PROPS.dayAndTime).toEqual({ displayFormat: 'yyyy-MM-dd HH:mm', pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm', timeIntervals: 15 })
    expect(PICKER_PROPS.timeOnly).toEqual({ displayFormat: 'HH:mm', pickerAppearance: 'timeOnly', timeFormat: 'HH:mm', timeIntervals: 15 })

    // Pacific/Auckland (UTC+13 in December): picking 1 Dec, the picker hands over 1 Dec 12:00 UTC,
    // which local getters would read as 2 Dec; the UTC read gives the picked day.
    const savedTZ = process.env.TZ
    process.env.TZ = 'Pacific/Auckland'
    try {
      const picked = new Date(2026, 11, 1)
      picked.setHours(12 - picked.getTimezoneOffset() / 60, 0)
      expect(picked.toISOString()).toBe('2026-12-01T12:00:00.000Z')
      expect(picked.getDate()).toBe(2)
      expect(pickToText(picked, 'dayOnly')).toBe('2026-12-01')
      const back = textToPick('2026-12-01', 'dayOnly')!
      expect([back.getFullYear(), back.getMonth() + 1, back.getDate()]).toEqual([2026, 12, 1])
      expect(back.toISOString()).toBe('2026-11-30T23:00:00.000Z')
    } finally {
      if (savedTZ === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = savedTZ
      }
    }
  })

  test('jump hint lists skipped sections that have show rules', () => {
    const form = {
      'sections.0.key': 'a',
      'sections.0.nextStepRules.0.targetSectionKey': 'd',
      'sections.1.key': 'b',
      'sections.1.visibilityRules.rows.0.fieldKey': 'kind',
      'sections.2.key': 'c',
      'sections.3.key': 'd',
    }
    expect(skippedSectionsWithShowRules(state(form), 0)).toEqual([{ skipped: 'b', target: 'd' }])
    expect(skippedSectionsWithShowRules(state(form), 2)).toEqual([])
    // A show rule row with an empty field key doesn't count.
    expect(skippedSectionsWithShowRules(state({ ...form, 'sections.1.visibilityRules.rows.0.fieldKey': '' }), 0)).toEqual([])
    // Another section's jumps, a jump back and a missing target pass over nothing for section 0.
    expect(
      skippedSectionsWithShowRules(
        state({ ...form, 'sections.0.nextStepRules.0.targetSectionKey': 'gone', 'sections.2.nextStepRules.0.targetSectionKey': 'a' }),
        0,
      ),
    ).toEqual([])
    // Several jumps and sections: each pair once, jumps in order, sections in form order.
    expect(
      skippedSectionsWithShowRules(
        state({
          ...form,
          'sections.0.nextStepRules.1.targetSectionKey': 'c',
          'sections.0.nextStepRules.2.targetSectionKey': 'd',
          'sections.2.visibilityRules.rows.0.fieldKey': 'kind.fieldSet',
        }),
        0,
      ),
    ).toEqual([
      { skipped: 'b', target: 'd' },
      { skipped: 'c', target: 'd' },
      { skipped: 'b', target: 'c' },
    ])
  })

  test("row texts read the row's own values", () => {
    expect(sectionRowText({ key: 'contact', title: 'Your details' }, 0)).toBe('contact · Your details')
    expect(sectionRowText({ key: 'contact' }, 0)).toBe('contact')
    expect(sectionRowText({ title: 'Your details' }, 0)).toBe('Your details')
    expect(questionRowText({ fieldKey: 'full-name', words: { label: 'Full name' } }, 0, 'Text')).toBe('Text · full-name · Full name')
    expect(questionRowText({ heading: 'About you' }, 0, 'Heading')).toBe('Heading · About you')
    expect(questionRowText({ blockType: 'helpText', body: 'A few questions.' }, 0, 'Help text')).toBe('Help text · A few questions.')
    expect(questionRowText({ fieldKey: 'start' }, 0, 'Date')).toBe('Date · start')
    expect(ruleRowText({ fieldKey: 'need', operator: 'equals', value: 'quote' }, 0)).toBe('need equals quote')
    expect(ruleRowText({ fieldKey: 'email', operator: 'hasValue' }, 0)).toBe('email has a value')
    expect(ruleRowText({ fieldKey: 'email', operator: 'notHasValue', value: 'left over' }, 0)).toBe('email has no value')
    expect(optionRowText({ label: 'Quote', value: 'quote' }, 0)).toBe('Quote = quote')
    expect(jumpRowText({ targetSectionKey: 'details' }, 0)).toBe('Jump to details')
    expect(formRowText({ label: 'Team' }, 0)).toBe('Team')
    const long = 'x'.repeat(80)
    expect(formRowText({ title: long }, 0)).toBe(`${'x'.repeat(72)}…`)
    expect(sectionRowText({ key: 'k', title: long }, 0)).toBe(`${`k · ${long}`.slice(0, 72)}…`)
    for (const fn of [formRowText, sectionRowText, ruleRowText, optionRowText, jumpRowText]) {
      expect(fn({}, 2), fn.name).toBe('Row 3')
    }
    expect(questionRowText({}, 2)).toBe('Row 3')
    expect(formRowText(undefined, 0)).toBe('Row 1')
  })
})
