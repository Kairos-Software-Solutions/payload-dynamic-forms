// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PrefillParamField } from '../../src/admin/PrefillParamField.js'
import { form } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

const base = 'sections.0.fields.0.'
const field = { name: 'prefillParam', admin: { width: '50%' }, label: 'Prefill from link parameter' } as never

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
})
