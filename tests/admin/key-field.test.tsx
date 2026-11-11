// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { KeyField } from '../../src/admin/KeyField.js'
import { form } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

const field = { name: 'fieldKey', admin: { width: '50%' }, label: 'Key', required: true } as never

describe('key field', () => {
  test('key field formats the value as you type', () => {
    const path = 'sections.0.fields.0.fieldKey'
    act(() => form.reset({ [path]: '' }))
    render(<KeyField field={field} path={path} />)
    const input = screen.getByLabelText<HTMLInputElement>('Key')
    fireEvent.change(input, { target: { value: 'Project Type' } })
    expect(form.get(path)).toBe('project-type')
    expect(input.value).toBe('project-type')
    // A trailing space becomes one dash, so typing can go on.
    fireEvent.change(input, { target: { value: 'project-type ' } })
    expect(form.get(path)).toBe('project-type-')
    // The row width reaches the wrapper.
    expect((input.parentElement as HTMLElement).style.getPropertyValue('--field-width')).toBe('50%')
  })
})
