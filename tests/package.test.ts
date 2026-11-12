import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const licence = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')

describe('package', () => {
  test('package metadata and licence agree', () => {
    expect(pkg.name).toBe('payload-dynamic-forms')
    expect(pkg.version).toBe('0.5.0')
    expect(pkg.license).toBe('MIT')
    expect(licence.split('\n')[0]).toBe(`${pkg.license} License`)
    expect(licence).toContain('Copyright (c) 2026 Kairos Software Solutions')
    expect(pkg.peerDependencies).toEqual({ '@payloadcms/ui': '^3.92.1', payload: '^3.92.1', react: '^19.2.1' })
    expect(pkg.dependencies ?? {}).toEqual({})
    expect(pkg.publishConfig).toEqual({ access: 'public' })
    expect(pkg.repository.url).toContain('github.com/Kairos-Software-Solutions/payload-dynamic-forms')
    expect(pkg.keywords).toContain('payload-plugin')
    expect(pkg.engines).toEqual({ node: '^22.23.4 || >=24.22.1' })
    expect(pkg.files).toEqual(['dist'])
    // Payload packages pinned to the floor of the peer range.
    for (const [name, version] of Object.entries(pkg.devDependencies as Record<string, string>)) {
      if (name === 'payload' || (name.startsWith('@payloadcms/') && name !== '@payloadcms/eslint-config')) {
        expect(version, name).toBe('3.92.1')
      }
    }
  })

  test('entry fields point at dist and publishConfig holds only access', () => {
    expect(pkg.main).toBe('./dist/index.js')
    expect(pkg.types).toBe('./dist/index.d.ts')
    expect(Object.keys(pkg.exports)).toEqual(['.', './shared', './client'])
    for (const [entry, conditions] of Object.entries(pkg.exports as Record<string, Record<string, string>>)) {
      // npm publish ships these fields as written; `types` must come first (Node docs).
      expect(Object.keys(conditions), entry).toEqual(['types', 'import', 'default'])
      for (const target of Object.values(conditions)) {
        expect(target, entry).toMatch(/^\.\/dist\//)
      }
    }
    expect(Object.entries(pkg.exports['.'])).toEqual([
      ['types', './dist/index.d.ts'],
      ['import', './dist/index.js'],
      ['default', './dist/index.js'],
    ])
    expect(Object.entries(pkg.exports['./shared'])).toEqual([
      ['types', './dist/exports/shared.d.ts'],
      ['import', './dist/exports/shared.js'],
      ['default', './dist/exports/shared.js'],
    ])
    expect(Object.entries(pkg.exports['./client'])).toEqual([
      ['types', './dist/exports/client.d.ts'],
      ['import', './dist/exports/client.js'],
      ['default', './dist/exports/client.js'],
    ])
    expect(JSON.stringify({ exports: pkg.exports, main: pkg.main, types: pkg.types })).not.toContain('./src/')
    expect(pkg.publishConfig).toEqual({ access: 'public' })
    for (const key of ['main', 'types', 'exports']) {
      expect(pkg.publishConfig, key).not.toHaveProperty(key)
    }
  })
})
