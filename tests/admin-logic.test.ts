import { describe, expect, test } from 'vitest'

import {
  fieldKeyOptions,
  joinRuleKey,
  sectionIndexOf,
  sectionKeyOptions,
  siblingPath,
  splitStoredRuleKey,
} from '../src/admin/formKeys.js'
import { caretAfterFormat, formatKeyInput } from '../src/admin/keys.js'
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
})
