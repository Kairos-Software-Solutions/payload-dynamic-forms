import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

function headings(): string[] {
  return [...readme.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].trim())
}

describe('README', () => {
  test('readme example equals examples/minimal-form.tsx', () => {
    const rendering = readme.slice(readme.indexOf('\n## Rendering\n'))
    expect(rendering.length).toBeLessThan(readme.length)
    const block = /```tsx\n([\s\S]*?)\n```/.exec(rendering)
    expect(block).not.toBeNull()
    const file = fs.readFileSync(path.join(root, 'examples/minimal-form.tsx'), 'utf8')
    expect(block![1]).toBe(file.replace(/\n+$/, ''))
    // The example is part of the typecheck (tsconfig include) and uses only the shared entry.
    const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'))
    expect(tsconfig.include).toContain('./examples/**/*.tsx')
    expect(file).toContain("from 'payload-dynamic-forms/shared'")
  })

  test('readme uses the package name from package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string }
    expect(pkg.name).toBe('payload-dynamic-forms')
    expect(readme.split('\n')[0]).toBe(`# ${pkg.name}`)
    for (const command of ['npm install', 'yarn add', 'pnpm add']) {
      const lines = readme.split('\n').filter((line) => line.startsWith(`${command} `))
      expect(lines, command).toEqual([`${command} ${pkg.name}`])
    }
    // No earlier package or repo name anywhere in the README.
    // Built from parts so the repo-wide name grep (task 8.1) stays empty.
    const scope = ['@kairos', 'software', 'solutions/'].join('-')
    for (const old of [scope, ['kairos', 'payload', 'forms'].join('-'), 'payload-forms-plugin']) {
      expect(readme, old).not.toContain(old)
    }
    expect(readme).not.toMatch(/(^|[^-])payload-forms\b/)
  })

  test('readme has every setup section', () => {
    const found = headings()
    for (const section of [
      'Install',
      'Options',
      'Attachments and storage order',
      'Migrations',
      'Switching off',
      'Rendering',
      'WhatsApp',
      'Delivery after the reply',
      'Endpoints',
      'Compatibility',
      'Changelog',
    ]) {
      expect(found, section).toContain(section)
    }
    expect(readme).toMatch(/no visitor UI/i)
    expect(readme).toContain('^3.92.1')
    expect(readme).toMatch(/drops those tables at the next migration/)
    expect(readme).toContain('6eb8e57198678f2e669b906097f670ec98b17523')
  })

  test('readme has the 0.3.0 changelog and migration note', () => {
    const sectionText = (name: string) => {
      const start = readme.indexOf(`\n## ${name}\n`)
      expect(start, name).toBeGreaterThan(-1)
      const rest = readme.slice(start + name.length + 5)
      const end = rest.search(/^## /m)
      return end === -1 ? rest : rest.slice(0, end)
    }
    const changelog = sectionText('Changelog')
    // 0.3.0 is present, after the 0.4.0 entry.
    const entries = changelog.split('\n').filter((line) => line.startsWith('- '))
    const at = entries.findIndex((line) => /^0\.3\.0\b/.test(line.slice(2)))
    expect(at).toBeGreaterThan(entries.findIndex((line) => /^0\.4\.0\b/.test(line.slice(2))))
    expect(at).toBeGreaterThan(-1)

    const migrations = sectionText('Migrations')
    const note = migrations.split('\n\n').find((paragraph) => paragraph.includes('0.3.0'))
    expect(note).toBeDefined()
    expect(note).toContain('_locales')
    expect(note).toContain('custom_forms_delivery_emails_locales')
    expect(note).toMatch(/copy each row's old subject and body/)

    expect(sectionText('Compatibility')).toMatch(/0\.3\.0 or later/)
    expect(sectionText('Rendering')).toContain('draft: true')
  })

  test('readme has the 0.4.0 changelog and migration note', () => {
    const sectionText = (name: string) => {
      const start = readme.indexOf(`\n## ${name}\n`)
      expect(start, name).toBeGreaterThan(-1)
      const rest = readme.slice(start + name.length + 5)
      const end = rest.search(/^## /m)
      return end === -1 ? rest : rest.slice(0, end)
    }
    // 0.4.0 is present, right after the 0.5.0 entry.
    const entries = sectionText('Changelog')
      .split('\n')
      .filter((line) => line.startsWith('- '))
    expect(entries[0].slice(2)).toMatch(/^0\.5\.0\b/)
    expect(entries[1].slice(2)).toMatch(/^0\.4\.0\b/)

    const migrations = sectionText('Migrations')
    const note = migrations.slice(migrations.indexOf('**0.4.0.**'))
    expect(migrations).toContain('**0.4.0.**')
    for (const words of ['prefill_from_key', 'presentation_mode', 'payload generate:importmap', 'ADD COLUMN prefill_from_key', 'snapshot JSON']) {
      expect(note, words).toContain(words)
    }
    expect(note).toMatch(/SQLite and D1/)
    expect(note).toMatch(/rebuild of the forms table/)
    expect(note).toMatch(/deletes the child rows/)
    expect(note).toMatch(/saved with 0\.3\.0 keep their prefill parameter/)
    expect(note).toMatch(/without their row ids/)
    expect(note).toMatch(/overwrites a custom prefill parameter/)
    expect(note).toMatch(/Rollback/)
    expect(note).toMatch(/Postgres/)

    // Install says to regenerate the import map; the field types describe the new defaults.
    expect(sectionText('Install')).toContain('payload generate:importmap')
    const options = sectionText('Options')
    expect(options).toMatch(/Prefill lock/)
    expect(options).toMatch(/at least two choices/)
    expect(options).toMatch(/Step by step/)
    expect(options).toMatch(/pick their field/)
  })

  test('readme has the 0.5.0 changelog and migration note', () => {
    const sectionText = (name: string) => {
      const start = readme.indexOf(`\n## ${name}\n`)
      expect(start, name).toBeGreaterThan(-1)
      const rest = readme.slice(start + name.length + 5)
      const end = rest.search(/^## /m)
      return end === -1 ? rest : rest.slice(0, end)
    }
    const first = sectionText('Changelog')
      .split('\n')
      .find((line) => line.startsWith('- '))
    expect(first!.slice(2)).toMatch(/^0\.5\.0\b/)

    const migrations = sectionText('Migrations')
    expect(migrations).toContain('**0.5.0.**')
    const note = migrations.slice(migrations.indexOf('**0.5.0.**'))
    for (const words of [
      'default_value',
      '_locales',
      'mode',
      'value_format',
      'display_style',
      'send_another',
      'wording_send_another',
      'metadata_time_zone',
      'carryOverDefault',
      'forms-0.5.0-carry-over.txt',
      'rollbackDefault',
      'ADD COLUMN',
      'snapshot JSON',
      'payload generate:importmap',
    ]) {
      expect(note, words).toContain(words)
    }
    expect(note).toMatch(/SQLite and D1: hand-write the migration/)
    expect(note).toMatch(/can rebuild tables/)
    expect(note).toMatch(/deletes the child rows/)
    expect(note).toMatch(/Postgres/)
    expect(note).toMatch(/copy, the report file and the backfill run after the `ADD COLUMN` statements and before that `DROP COLUMN`/)
    expect(note).toMatch(/defaults that don't fit are reported/)
    expect(note).toMatch(/backfill/)
    expect(note).toContain("mode = 'dayOnly'")
    expect(note).toContain('send_another = 0')
    expect(note).toMatch(/Send another words per locale/)
    expect(note).toMatch(/\*\*Rollback:\*\* run the migration's `down\(\)` before re-pinning 0\.4\.0/)
    expect(note).toMatch(/a 0\.5\.0 save clears the old `_locales` default/)
  })

  test('readme explains date modes, jumps and send another', () => {
    const subsection = (name: string) => {
      const start = readme.search(new RegExp(`^#{2,3} ${name}$`, 'm'))
      expect(start, name).toBeGreaterThan(-1)
      const rest = readme.slice(start).replace(/^.*\n/, '')
      const end = rest.search(/^#{2,3} /m)
      return end === -1 ? rest : rest.slice(0, end)
    }
    const dates = subsection('Date and time questions')
    for (const words of ['**Date**', '**Date and time**', '**Time**', '`dayOnly`', '`dayAndTime`', '`timeOnly`', 'TIME_ZONE_FIELD', '`_tz`', '`timezone`']) {
      expect(dates, words).toContain(words)
    }
    expect(dates).toMatch(/Date-only and time-only answers are never converted to UTC/)
    const jumps = subsection('Jumps and show rules')
    expect(jumps).toMatch(/a jump skips every section in between/)
    expect(jumps).toMatch(/For an optional section, don't jump over it: use a show rule/)
    const again = subsection('Send another')
    expect(again).toMatch(/Turnstile tokens are single use/)
    expect(again).toMatch(/needs a fresh token/)
    const options = readme.slice(readme.indexOf('\n## Options\n'), readme.indexOf('\n## Attachments and storage order\n'))
    const row = (name: string) => options.split('\n').find((line) => line.startsWith(`| \`${name}\``))
    expect(row('timezone')).toMatch(/\| `UTC` \|/)
    expect(row('metadata')).toContain('`metadata.timeZone` (default on)')
    expect(row('metadata')).toMatch(/still used for that request/)
  })
})
