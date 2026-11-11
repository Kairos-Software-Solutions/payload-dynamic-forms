// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { NoAnswerHint } from '../../src/admin/NoAnswerHint.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(cleanup)

describe('no-answer hint', () => {
  test('hint names none of the above and not sure', () => {
    const { container } = render(<NoAnswerHint field={{ name: 'noAnswerHint' } as never} path="sections.0.fields.0.noAnswerHint" />)
    const text = container.textContent || ''
    expect(text).toContain("can't clear it")
    expect(text).toContain('“None of the above”')
    expect(text).toContain('“Not sure”')
  })
})
