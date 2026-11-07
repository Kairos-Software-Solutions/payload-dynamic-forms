import { describe, expect, test } from 'vitest'

import { buildWhatsAppMessage, whatsappUrl } from '../src/exports/shared.js'
import { topicForm } from './fixtures/forms.js'

describe('whatsapp', () => {
  test('topic-driven message has opener, answered rows and closer', () => {
    const form = topicForm()
    const answers = {
      name: 'Ana',
      item: 'X100',
      link: '',
      need: 'cameras',
      notes: 'Second hand is fine',
      'service-detail': 'left over from another choice',
    }
    const message = buildWhatsAppMessage(form, answers, { template: '{{need.opener}}\n\n{{*}}\n\n{{need.closer}}' })
    expect(message).toBe(
      [
        'Hello! I have a question about cameras.',
        '',
        '*Name:* Ana',
        '*Topic:* Cameras',
        '*Model:* X100',
        '*Notes:* Second hand is fine',
        '',
        'Thanks, talk soon.',
      ].join('\n'),
    )
    expect(message).not.toContain('Job')
    expect(message).not.toContain('Link')
    expect(message).not.toMatch(/\n{3,}/)
  })

  test('url keeps digits only and encodes the message', () => {
    const message = 'Hi there *Name:* A & B\nline two'
    expect(whatsappUrl('+1 (555) 000-1234', message)).toBe(
      `https://wa.me/15550001234?text=${encodeURIComponent(message)}`,
    )
  })
})
