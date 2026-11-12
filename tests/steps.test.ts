import { describe, expect, test } from 'vitest'

import { checkAnswers, type FormLike, getNextSectionKey, getStepPath, getStepProgress } from '../src/exports/shared.js'
import { input } from './fixtures/forms.js'

function budgetForm(): FormLike {
  return {
    presentationMode: 'steps',
    sections: [
      {
        fields: [input('number', 'budget', { required: true })],
        key: 'a',
        nextStepRules: [{ rows: [{ fieldKey: 'budget', operator: 'greaterThan', value: '1000' }], targetSectionKey: 'c' }],
      },
      { fields: [input('text', 'small-detail', { required: true })], key: 'b' },
      { fields: [input('text', 'big-detail')], key: 'c' },
      { fields: [input('email', 'email')], key: 'd' },
    ],
  }
}

describe('steps', () => {
  test('first matching next-step rule wins, else next visible', () => {
    const form = budgetForm()
    expect(getNextSectionKey(form, 'a', { budget: 5000 })).toBe('c')
    expect(getNextSectionKey(form, 'a', { budget: 500 })).toBe('b')
    expect(getStepPath(form, { budget: 5000 })).toEqual(['a', 'c', 'd'])
    expect(getStepPath(form, { budget: 500 })).toEqual(['a', 'b', 'c', 'd'])
    // A second matching rule after the first does not win.
    form.sections![0].nextStepRules!.push({ rows: [{ fieldKey: 'budget', operator: 'hasValue' }], targetSectionKey: 'd' })
    expect(getNextSectionKey(form, 'a', { budget: 5000 })).toBe('c')
    // A rule targeting a hidden section is passed over.
    form.sections![2].visibilityRules = { rows: [{ fieldKey: 'budget', operator: 'lessThan', value: '0' }] }
    expect(getNextSectionKey(form, 'a', { budget: 5000 })).toBe('d')
  })

  test('sections skipped by a jump are not checked', () => {
    const form = budgetForm()
    const result = checkAnswers(form, { 'big-detail': 'lots', budget: '5000', 'small-detail': 'left over' })
    expect(result.fieldErrors).toEqual({})
    expect(result.ok).toBe(true)
    expect(result.answers).not.toHaveProperty('small-detail')
    expect(result.answers).toMatchObject({ 'big-detail': 'lots', budget: 5000 })
    // Without the jump, B is on the path and its required field counts.
    const small = checkAnswers(form, { budget: '500' })
    expect(Object.keys(small.fieldErrors)).toEqual(['small-detail'])
  })

  test('step progress counts the path, not every section', () => {
    const form = budgetForm()
    const progress = getStepProgress(form, { budget: 5000 }, 'c', { stepProgress: 'Step {{current}} of {{total}}' })
    expect(progress).toEqual({ current: 2, text: 'Step 2 of 3', total: 3 })
    form.wording = { stepProgress: 'Paso {{current}} de {{total}}' }
    expect(getStepProgress(form, { budget: 5000 }, 'd').text).toBe('Paso 3 de 3')
  })

  test('a jump skips a section whose show rule matches', () => {
    const form: FormLike = {
      presentationMode: 'steps',
      sections: [
        {
          fields: [input('radio', 'kind', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] })],
          key: 's1',
          nextStepRules: [{ rows: [{ fieldKey: 'kind', operator: 'equals', value: 'a' }], targetSectionKey: 's3' }],
        },
        { fields: [input('text', 'more')], key: 's2', visibilityRules: { rows: [{ fieldKey: 'kind', operator: 'equals', value: 'a' }] } },
        { fields: [input('text', 'last')], key: 's3' },
      ],
    }
    expect(getStepPath(form, { kind: 'a' })).toEqual(['s1', 's3'])
    expect(getStepPath(form, { kind: 'b' })).toEqual(['s1', 's3'])
    expect(getNextSectionKey(form, 's1', { kind: 'a' })).toBe('s3')
    // s2's show rule matches for a, but the jump goes past it, so its answers are not kept.
    expect(checkAnswers(form, { kind: 'a', last: 'x', more: 'y' }).answers).toEqual({ kind: 'a', last: 'x' })
  })
})
