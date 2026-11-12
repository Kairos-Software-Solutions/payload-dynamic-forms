import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const lockfile = fs.readFileSync(path.join(root, 'yarn.lock'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>
}

type Entry = { key: string; name: string; resolution: string; version: string }

/** Every resolved entry in yarn.lock: its key line, package name, resolution and version. */
function lockEntries(): Entry[] {
  return lockfile
    .split(/\n(?=")/)
    .filter((block) => block.startsWith('"') && !block.startsWith('"__metadata'))
    .map((block) => {
      const key = block.slice(0, block.indexOf('\n'))
      const resolution = /^ {2}resolution: "(.+)"$/m.exec(block)?.[1] ?? ''
      const version = /^ {2}version: (.+)$/m.exec(block)?.[1] ?? ''
      const name = resolution.slice(0, resolution.indexOf('@', 1))
      return { name, key, resolution, version }
    })
}

function parse(version: string): number[] {
  return version
    .replace(/^[\^~]/, '')
    .split(/[-+]/)[0]
    .split('.')
    .map(Number)
}

/** -1, 0 or 1, comparing major.minor.patch numerically. */
function compare(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1
    }
  }
  return 0
}

// The first fixed version of each advisory on the 11 November 2026 list.
const FIXED: Record<string, string> = {
  '@eslint/plugin-kit': '0.3.4',
  '@payloadcms/next': '3.93.0',
  '@vitest/mocker': '4.1.12',
  esbuild: '0.25.0',
  'file-type': '21.3.2',
  next: '16.4.5',
  payload: '3.93.0',
  vitest: '4.1.11',
}

describe('dependencies', () => {
  test('lockfile has no version from the November 2026 advisories', () => {
    const entries = lockEntries()
    expect(entries.length).toBeGreaterThan(100)
    for (const entry of entries) {
      expect(entry.name, entry.key).not.toBe('')
      expect(entry.version, entry.key).toMatch(/^\d+\.\d+\.\d+/)
    }
    for (const [name, fixed] of Object.entries(FIXED)) {
      const found = entries.filter((e) => e.name === name)
      expect(found.length, name).toBeGreaterThan(0)
      for (const entry of found) {
        expect(compare(entry.version, fixed), `${entry.key} -> ${entry.version}`).toBeGreaterThanOrEqual(0)
      }
    }
    // yaml: the advisory covers 2.x below 2.8.3.
    for (const entry of entries.filter((e) => e.name === 'yaml')) {
      if (parse(entry.version)[0] === 2) {
        expect(compare(entry.version, '2.8.3'), entry.key).toBeGreaterThanOrEqual(0)
      }
    }
    // minimatch: fixed only in 11.0.1, so no 9.x or 10.x at all.
    const minimatch = entries.filter((e) => e.name === 'minimatch')
    expect(minimatch.length).toBeGreaterThan(0)
    for (const entry of minimatch) {
      expect([9, 10], entry.key).not.toContain(parse(entry.version)[0])
    }
    // deepmerge has no fixed release; it stays on 4.3.1 (Payload pins it).
    for (const entry of entries.filter((e) => e.name === 'deepmerge')) {
      expect(entry.version, entry.key).toBe('4.3.1')
    }
  })

  test('esbuild-kit transforms TypeScript on the lifted esbuild', async () => {
    // Load core-utils from where drizzle-kit's loader (@esbuild-kit/esm-loader) resolves it.
    const loaderRequire = createRequire(createRequire(path.join(root, 'package.json')).resolve('@esbuild-kit/esm-loader'))
    const coreUtilsPath = loaderRequire.resolve('@esbuild-kit/core-utils')
    const coreUtils = loaderRequire('@esbuild-kit/core-utils') as {
      transform: (code: string, filePath: string, options?: Record<string, unknown>) => Promise<{ code: string }>
    }
    // core-utils minifies whitespace by default; turn that off to compare readable output.
    const result = await coreUtils.transform('const a: number = 1', 'a.ts', { minifyWhitespace: false })
    expect(result.code.trim()).toBe('const a = 1;')

    // The esbuild that core-utils itself resolves (esbuild has no exports map, so package.json is reachable).
    const esbuildPkg = createRequire(coreUtilsPath)('esbuild/package.json') as { version: string }
    expect(compare(esbuildPkg.version, '0.25.0')).toBeGreaterThanOrEqual(0)
  })

  test('lockfile resolves one eslint and one typescript', () => {
    const entries = lockEntries()
    for (const name of ['eslint', 'typescript']) {
      const wanted = pkg.devDependencies[name].replace(/^[\^~]/, '')
      const found = entries.filter((e) => e.name === name)
      expect(found.length, name).toBeGreaterThan(0)
      for (const entry of found) {
        expect(entry.version, entry.key).toBe(wanted)
      }
    }
    // TypeScript: the npm entry and Yarn's built-in compat patch, both on the devDependency version.
    const typescript = entries.filter((e) => e.name === 'typescript')
    expect(typescript.some((e) => e.resolution.startsWith('typescript@npm:'))).toBe(true)
    expect(typescript.some((e) => e.resolution.startsWith('typescript@patch:'))).toBe(true)
  })
})
