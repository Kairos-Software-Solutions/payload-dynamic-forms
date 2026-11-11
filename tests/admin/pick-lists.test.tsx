// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RuleFieldKeyField } from '../../src/admin/RuleFieldKeyField.js'
import { SectionTargetField } from '../../src/admin/SectionTargetField.js'
import { form, optionTexts } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

const rulePath = 'sections.1.visibilityRules.rows.0.fieldKey'
const ruleField = { name: 'fieldKey', admin: { width: '40%' }, label: 'Field', required: true } as never
const targetPath = 'sections.1.nextStepRules.0.targetSectionKey'
const targetField = { name: 'targetSectionKey', label: 'Next section', required: true } as never

function formWithQuestions(rule: string) {
  act(() =>
    form.reset({
      [rulePath]: rule,
      'sections.0.fields.0.blockType': 'text',
      'sections.0.fields.0.fieldKey': 'name',
      'sections.0.fields.1.blockType': 'radio',
      'sections.0.fields.1.fieldKey': 'need',
      'sections.0.fields.1.optionsFrom': 'topics',
      'sections.0.fields.2.blockType': 'heading',
      'sections.0.fields.2.heading': 'About you',
      'sections.0.key': 'start',
      'sections.1.key': 'more',
    }),
  )
  render(<RuleFieldKeyField field={ruleField} path={rulePath} />)
  return screen.getByLabelText<HTMLSelectElement>('Field')
}

describe('pick-lists', () => {
  test("rule key lists the form's input keys and keeps the attribute", () => {
    const select = formWithQuestions('')
    expect(optionTexts(select)).toEqual(['name', 'need'])
    expect(screen.queryByLabelText('Attribute (optional)')).toBeNull()
    fireEvent.change(select, { target: { value: 'need' } })
    expect(form.get(rulePath)).toBe('need')
    const attribute = screen.getByLabelText<HTMLInputElement>('Attribute (optional)')
    fireEvent.change(attribute, { target: { value: 'fieldSet' } })
    expect(form.get(rulePath)).toBe('need.fieldSet')
    expect(select.value).toBe('need')
    expect(attribute.value).toBe('fieldSet')
    // A field with typed choices takes no attribute.
    fireEvent.change(select, { target: { value: 'name' } })
    expect(form.get(rulePath)).toBe('name')
    expect(screen.queryByLabelText('Attribute (optional)')).toBeNull()
    // The row width reaches the wrapper.
    expect((select.closest('.rule-field-key-field') as HTMLElement).style.getPropertyValue('--field-width')).toBe('40%')
  })

  test('next section lists the other sections', () => {
    act(() => form.reset({ 'sections.0.key': 'about', 'sections.1.key': 'details', 'sections.2.key': 'done', [targetPath]: '' }))
    render(<SectionTargetField field={targetField} path={targetPath} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Next section')
    expect(optionTexts(select)).toEqual(['about', 'done'])
    fireEvent.change(select, { target: { value: 'done' } })
    expect(form.get(targetPath)).toBe('done')
  })

  test('pick-lists follow unsaved keys', () => {
    const select = formWithQuestions('')
    expect(optionTexts(select)).toEqual(['name', 'need'])
    act(() => form.set('sections.0.fields.1.fieldKey', 'topic'))
    expect(optionTexts(select)).toEqual(['name', 'topic'])
    expect(optionTexts(select)).not.toContain('need')
    cleanup()
    act(() => form.reset({ 'sections.0.key': 'about', 'sections.1.key': 'details', [targetPath]: '' }))
    render(<SectionTargetField field={targetField} path={targetPath} />)
    const target = screen.getByLabelText<HTMLSelectElement>('Next section')
    act(() => form.set('sections.2.key', 'Done Now'))
    expect(optionTexts(target)).toEqual(['about', 'done-now'])
  })

  test('a stored key not in the form stays visible', () => {
    const select = formWithQuestions('old-key')
    expect(optionTexts(select)).toEqual(['name', 'need', 'old-key (not in this form)'])
    expect(select.value).toBe('old-key')
    expect(form.get(rulePath)).toBe('old-key')
    cleanup()
    act(() => form.reset({ 'sections.0.key': 'about', 'sections.1.key': 'details', [targetPath]: 'gone' }))
    render(<SectionTargetField field={targetField} path={targetPath} />)
    const target = screen.getByLabelText<HTMLSelectElement>('Next section')
    expect(optionTexts(target)).toEqual(['about', 'gone (not in this form)'])
    expect(target.value).toBe('gone')
  })
})
