import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

function headings(): string[] {
  return [...readme.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]!.trim())
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
    expect(file).toContain("from '@kairos-software-solutions/payload-forms/shared'")
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
    ]) {
      expect(found, section).toContain(section)
    }
    expect(readme).toMatch(/no visitor UI/i)
    expect(readme).toContain('^3.92.1')
    expect(readme).toMatch(/drops those tables at the next migration/)
    expect(readme).toContain('6eb8e57198678f2e669b906097f670ec98b17523')
  })
})
