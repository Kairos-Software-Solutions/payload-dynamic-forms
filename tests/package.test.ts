import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const licence = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')

const EXACT = /^\d+\.\d+\.\d+$/

function parse(version: string): number[] {
  return version.split('.').map(Number)
}

/** -1, 0 or 1, comparing major.minor.patch numerically. */
function compare(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) {
      return x[i] < y[i] ? -1 : 1
    }
  }
  return 0
}

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return filesUnder(full)
    }
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Every import and re-export specifier, type-only ones included, read with the TS parser. */
function allImports(source: string): string[] {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      out.push(node.argument.literal.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

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
    // Payload packages share one exact version (checked against the peer ranges below).
    const payloadVersions = Object.entries(pkg.devDependencies as Record<string, string>).filter(
      ([name]) => name === 'payload' || (name.startsWith('@payloadcms/') && name !== '@payloadcms/eslint-config'),
    )
    expect(payloadVersions.map(([name]) => name)).toContain('payload')
    for (const [name, version] of payloadVersions) {
      expect(version, name).toMatch(EXACT)
      expect(version, name).toBe(pkg.devDependencies.payload)
    }
  })

  test('peer ranges accept the dev payload and react versions', () => {
    const accepts = (range: string, version: string) => {
      expect(range, range).toMatch(/^\^\d+\.\d+\.\d+$/)
      expect(version, version).toMatch(EXACT)
      const floor = range.slice(1)
      expect(parse(version)[0], `${version} major vs ${range}`).toBe(parse(floor)[0])
      expect(compare(version, floor), `${version} not below ${range}`).toBeGreaterThanOrEqual(0)
    }
    const payload = pkg.devDependencies.payload as string
    expect(pkg.peerDependencies.payload).toBe('^3.92.1')
    expect(pkg.peerDependencies['@payloadcms/ui']).toBe('^3.92.1')
    accepts(pkg.peerDependencies.payload, payload)
    accepts(pkg.peerDependencies['@payloadcms/ui'], payload)
    expect(pkg.devDependencies['@payloadcms/ui']).toBe(payload)
    expect(pkg.peerDependencies.react).toBe('^19.2.1')
    accepts(pkg.peerDependencies.react, pkg.devDependencies.react)
  })

  test('src imports only declared peers', () => {
    const peers = ['payload', '@payloadcms/ui', 'react']
    for (const peer of peers) {
      expect(Object.keys(pkg.peerDependencies), peer).toContain(peer)
    }
    const files = filesUnder(path.join(root, 'src'))
    expect(files.length).toBeGreaterThan(0)
    const seen = new Set<string>()
    for (const file of files) {
      const rel = path.relative(root, file)
      for (const specifier of allImports(fs.readFileSync(file, 'utf8'))) {
        seen.add(specifier)
        expect(specifier, rel).not.toMatch(/^next(\/|$)/)
        const allowed =
          specifier.startsWith('.') ||
          specifier === 'node:buffer' ||
          peers.some((peer) => specifier === peer || specifier.startsWith(`${peer}/`))
        expect(allowed, `${rel}: ${specifier}`).toBe(true)
      }
    }
    // The scan saw the runtime imports it is meant to check.
    for (const peer of peers) {
      expect([...seen], peer).toContain(peer)
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
