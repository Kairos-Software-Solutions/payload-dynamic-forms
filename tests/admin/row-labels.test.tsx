// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { QuestionLabel, RowLabel } from '../../src/admin/RowLabel.js'
import { rowLabel } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

describe('row labels', () => {
  test('array and block rows render their labels', () => {
    Object.assign(rowLabel, { data: { key: 'contact', title: 'Your details' }, path: 'sections.0', rowNumber: 0 })
    const section = render(<RowLabel kind="section" />)
    expect(section.container.textContent).toBe('contact · Your details')
    cleanup()
    Object.assign(rowLabel, {
      data: { blockType: 'date', fieldKey: 'start', words: { label: 'Start date' } },
      path: 'sections.0.fields.1',
      rowNumber: 1,
    })
    const question = render(<QuestionLabel typeLabel="Date" />)
    expect(question.container.textContent).toBe('Date · start · Start date')
    cleanup()
    // Generic rows (emails, webhooks, headers) and an empty row.
    Object.assign(rowLabel, { data: { label: 'Team' }, path: 'delivery.emails.0', rowNumber: 0 })
    expect(render(<RowLabel />).container.textContent).toBe('Team')
    cleanup()
    Object.assign(rowLabel, { data: {}, path: 'sections.2', rowNumber: 2 })
    expect(render(<RowLabel kind="section" />).container.textContent).toBe('Row 3')
  })
})
