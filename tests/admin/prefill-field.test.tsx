// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ACTIONS_STYLE, PrefillParamField } from '../../src/admin/PrefillParamField.js'
import { form } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

const base = 'sections.0.fields.0.'
const field = {
  name: 'prefillParam',
  admin: { description: 'Link parameter that prefills this answer.', width: '50%' },
  label: 'Prefill from link parameter',
} as never

function question(values: { blockType?: string; fieldKey: string; prefillFromKey: boolean | null; prefillParam: null | string }) {
  act(() =>
    form.reset({
      [`${base}blockType`]: values.blockType ?? 'text',
      [`${base}fieldKey`]: values.fieldKey,
      [`${base}prefillFromKey`]: values.prefillFromKey,
      [`${base}prefillParam`]: values.prefillParam,
    }),
  )
  render(<PrefillParamField field={field} path={`${base}prefillParam`} />)
  return screen.getByLabelText<HTMLInputElement>('Prefill from link parameter')
}

describe('prefill field', () => {
  test('prefill locks to the key and unlocks to edit', () => {
    const input = question({ fieldKey: 'need', prefillFromKey: true, prefillParam: 'need' })
    expect(input.value).toBe('need')
    expect(input.readOnly).toBe(true)

    // Locked: follows the key live.
    act(() => form.set(`${base}fieldKey`, 'topic'))
    expect(input.value).toBe('topic')
    expect(input.readOnly).toBe(true)
    expect(form.get(`${base}prefillParam`)).toBe('topic')

    // Unlock, then type.
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(form.get(`${base}prefillFromKey`)).toBe(false)
    expect(input.readOnly).toBe(false)
    fireEvent.change(input, { target: { value: 'ref' } })
    expect(input.value).toBe('ref')
    expect(form.get(`${base}prefillParam`)).toBe('ref')
    // Unlocked: a key change leaves the parameter alone.
    act(() => form.set(`${base}fieldKey`, 'topic-two'))
    expect(input.value).toBe('ref')
    act(() => form.set(`${base}fieldKey`, 'topic'))

    // Lock again: back to the key, read-only.
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    expect(form.get(`${base}prefillFromKey`)).toBe(true)
    expect(input.value).toBe('topic')
    expect(input.readOnly).toBe(true)
    expect(form.get(`${base}prefillParam`)).toBe('topic')
    cleanup()

    // A 0.3.0 row (lock null) shows unlocked with its stored text; an empty one stays empty.
    const legacy = question({ fieldKey: 'topic', prefillFromKey: null, prefillParam: 'need' })
    expect(legacy.value).toBe('need')
    expect(legacy.readOnly).toBe(false)
    expect(screen.getByRole('button', { name: 'Lock' })).toBeTruthy()
    expect(form.get(`${base}prefillParam`)).toBe('need')
    cleanup()
    const empty = question({ fieldKey: 'topic', prefillFromKey: null, prefillParam: null })
    expect(empty.value).toBe('')
    expect(form.get(`${base}prefillParam`)).toBeNull()
    cleanup()

    // A file upload question shows no lock.
    const upload = question({ blockType: 'fileUpload', fieldKey: 'cv', prefillFromKey: true, prefillParam: null })
    expect(screen.queryByRole('button')).toBeNull()
    expect(upload.readOnly).toBe(false)
  })

  test('lock button sits inside the input box', () => {
    // The nearest positioned ancestor, as the browser picks the containing block.
    const positionParent = (el: HTMLElement) => {
      let parent = el.parentElement
      while (parent && getComputedStyle(parent).position === 'static') {
        parent = parent.parentElement
      }
      return parent
    }
    for (const prefillFromKey of [true, false]) {
      const input = question({ fieldKey: 'need', prefillFromKey, prefillParam: 'need' })
      const button = screen.getByRole('button', { name: prefillFromKey ? 'Unlock' : 'Lock' })
      const actions = button.closest<HTMLElement>('.prefill-param-field__actions')
      expect(actions).not.toBeNull()
      const box = positionParent(actions as HTMLElement)
      const field = input.closest<HTMLElement>('.field-type.text')
      // Like the slug field: positioned in `.field-type__wrap`, the input's own box, not the field
      // (label and description included) …
      expect(box?.classList.contains('field-type__wrap')).toBe(true)
      expect(box).not.toBe(field)
      expect(box).toBe(input.parentElement)
      // … from the input's top edge over the input's height only (the description below is in the
      // same wrap), centred, at the inline end.
      expect(box?.querySelector('.field-description')?.textContent).toBe('Link parameter that prefills this answer.')
      expect(ACTIONS_STYLE).toEqual({
        alignItems: 'center',
        display: 'flex',
        gap: 'calc(var(--base) / 2)',
        height: 'calc(var(--base) * 2)',
        insetInlineEnd: 'calc(var(--base) / 2)',
        position: 'absolute',
        top: 0,
      })
      const style = (actions as HTMLElement).style
      expect(style.position).toBe('absolute')
      expect(style.top).toBe('0px')
      expect(style.bottom).toBe('')
      expect(style.height).toBe('calc(var(--base) * 2)')
      expect(style.alignItems).toBe('center')
      cleanup()
    }
  })
})
