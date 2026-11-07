import { describe, expect, test } from 'vitest'

import { buildMessageRows, buildTemplateValues, type FormLike, interpolate } from '../src/exports/shared.js'
import { input, TOPIC_OPTIONS } from './fixtures/forms.js'

describe('tokens', () => {
  test('keys with dashes and underscores fill in', () => {
    expect(interpolate('New {{project-type}} request from {{full_name}}', { full_name: 'Ana', 'project-type': 'web' })).toBe(
      'New web request from Ana',
    )
    expect(interpolate('{{ project-type }}!', { 'project-type': 'print' })).toBe('print!')
  })

  test('star tokens list answered visible fields and escape html', () => {
    const form: FormLike = {
      sections: [
        {
          fields: [
            input('text', 'name', { words: { label: 'Name' } }),
            input('text', 'company', { words: { label: 'Company' } }),
            input('checkbox', 'more'),
            input('textarea', 'secret', { visibilityRules: { rows: [{ fieldKey: 'more', operator: 'equals', value: 'true' }] }, words: { label: 'Hidden' } }),
            input('textarea', 'message', { words: { label: 'Message' } }),
          ],
          key: 's',
        },
      ],
    }
    const answers = { name: 'Ana', company: '', message: '<script>alert(1)</script>', more: false, secret: 'should not show' }
    const rows = buildMessageRows(form, answers)
    expect(rows.map((r) => r.label)).toEqual(['Name', 'Message'])
    expect(interpolate('{{*}}', {}, { rows })).toBe('Name: Ana\nMessage: <script>alert(1)</script>')
    const table = interpolate('{{*:table}}', {}, { html: true, rows })
    expect(table).toContain('<th align="left">Name</th><td>Ana</td>')
    expect(table).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(table).not.toContain('<script>')
    expect(table).not.toContain('Hidden')
    expect(table).not.toContain('Company')
  })

  test('attributes fill, unknown tokens empty, subjects single-line', () => {
    const form: FormLike = {
      sections: [{ fields: [input('radio', 'need', { options: TOPIC_OPTIONS }), input('text', 'name')], key: 's' }],
      title: 'Contact',
    }
    const values = buildTemplateValues(form, { name: 'Ana\nEvil: header', need: 'cameras' })
    expect(interpolate('{{need.opener}}|{{nope}}|{{formTitle}}', values)).toBe(
      'Hello! I have a question about cameras.||Contact',
    )
    const subject = interpolate('New request from {{name}}', values, { singleLine: true })
    expect(subject).toBe('New request from Ana Evil: header')
    expect(subject).not.toMatch(/[\r\n]/)
    expect(interpolate('{{name}}', { name: '<b>' }, { html: true })).toBe('&lt;b&gt;')
  })
})
