import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const licence = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')

describe('package', () => {
  test('package metadata and licence agree', () => {
    expect(pkg.name).toBe('payload-dynamic-forms')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.license).toBe('MIT')
    expect(licence.split('\n')[0]).toBe(`${pkg.license} License`)
    expect(licence).toContain('Copyright (c) 2026 Kairos Software Solutions')
    expect(pkg.peerDependencies).toEqual({ payload: '^3.92.1' })
    expect(pkg.dependencies ?? {}).toEqual({})
    expect(pkg.publishConfig.access).toBe('public')
    expect(pkg.repository.url).toContain('github.com/Kairos-Software-Solutions/payload-dynamic-forms')
    expect(pkg.keywords).toContain('payload-plugin')
    expect(pkg.engines).toEqual({ node: '^22.23.4 || >=24.22.1' })
    expect(pkg.files).toEqual(['dist'])
    // Published exports point at dist/ only.
    const exportsJson = JSON.stringify(pkg.publishConfig.exports)
    expect(Object.keys(pkg.publishConfig.exports)).toEqual(['.', './shared'])
    expect(exportsJson).not.toContain('./src/')
    const targets = Object.values(pkg.publishConfig.exports as Record<string, Record<string, string>>).flatMap((entry) => Object.values(entry))
    expect(targets.length).toBe(6)
    for (const target of targets) {
      expect(target).toMatch(/^\.\/dist\//)
    }
    expect(pkg.publishConfig.main).toBe('./dist/index.js')
    // Payload packages pinned to the floor of the peer range.
    for (const [name, version] of Object.entries(pkg.devDependencies as Record<string, string>)) {
      if (name === 'payload' || (name.startsWith('@payloadcms/') && name !== '@payloadcms/eslint-config')) {
        expect(version, name).toBe('3.92.1')
      }
    }
  })
})
