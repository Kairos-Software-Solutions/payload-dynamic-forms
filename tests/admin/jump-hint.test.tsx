// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { JumpSkipHint } from '../../src/admin/JumpSkipHint.js'
import { form } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

describe('jump hint', () => {
  test('jump hint names skipped sections with show rules', () => {
    act(() =>
      form.reset({
        'sections.0.key': 'a',
        'sections.0.nextStepRules.0.targetSectionKey': 'd',
        'sections.1.key': 'b',
        'sections.1.visibilityRules.rows.0.fieldKey': 'kind',
        'sections.2.key': 'c',
        'sections.3.key': 'd',
      }),
    )
    const { container } = render(<JumpSkipHint field={{ name: 'jumpSkipHint', type: 'ui' } as never} path="sections.0.jumpSkipHint" />)
    const text = container.textContent || ''
    expect(text).toContain('Jump to “d” skips “b”, which has its own show rules.')
    expect(text).toContain('A jump skips every section in between; for an optional section, use its show rules instead of a jump.')
    expect(text).not.toContain('“c”')
    // b's show rule removed (unsaved): nothing renders.
    act(() => form.set('sections.1.visibilityRules.rows.0.fieldKey', undefined))
    expect(container.textContent).toBe('')
    expect(container.innerHTML).toBe('')
  })
})
