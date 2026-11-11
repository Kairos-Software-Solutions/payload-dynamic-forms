import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return filesUnder(full)
    }
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Runtime import specifiers (type-only imports and exports are left out), read with the TS parser. */
function runtimeImports(source: string): string[] {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const named = clause?.namedBindings
      const typeOnly =
        clause?.isTypeOnly ||
        (clause && !clause.name && named && ts.isNamedImports(named) && named.elements.every((e) => e.isTypeOnly))
      if (!typeOnly) {
        out.push(node.moduleSpecifier.text)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause
      const typeOnly = node.isTypeOnly || (named && ts.isNamedExports(named) && named.elements.every((e) => e.isTypeOnly))
      if (!typeOnly) {
        out.push(node.moduleSpecifier.text)
      }
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

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs',
  'fs/promises', 'http', 'http2', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm',
  'worker_threads', 'zlib',
])

describe('workers safety', () => {
  test('shared entry imports nothing from payload, react or node at runtime', () => {
    const files = [...filesUnder(path.join(root, 'src/shared')), path.join(root, 'src/exports/shared.ts')]
    expect(files.length).toBeGreaterThan(5)
    const bad: string[] = []
    for (const file of files) {
      for (const spec of runtimeImports(fs.readFileSync(file, 'utf8'))) {
        if (
          spec === 'payload' ||
          spec.startsWith('payload/') ||
          spec.startsWith('@payloadcms/') ||
          spec === 'react' ||
          spec.startsWith('react/') ||
          spec.startsWith('node:') ||
          NODE_BUILTINS.has(spec) ||
          // Relative imports must stay inside src/shared.
          (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(path.join(root, 'src/shared')))
        ) {
          bad.push(`${path.relative(root, file)}: ${spec}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  test('src imports no Node built-ins except node:buffer', () => {
    const bad: string[] = []
    for (const file of filesUnder(path.join(root, 'src'))) {
      const source = fs.readFileSync(file, 'utf8')
      for (const spec of runtimeImports(source)) {
        const bare = spec.replace(/^node:/, '')
        if ((spec.startsWith('node:') || NODE_BUILTINS.has(bare)) && spec !== 'node:buffer') {
          bad.push(`${path.relative(root, file)}: import ${spec}`)
        }
      }
      if (source.includes('process.cwd')) {
        bad.push(`${path.relative(root, file)}: process.cwd`)
      }
    }
    expect(bad).toEqual([])
  })

  test('only the client entry imports react or payload ui', () => {
    const clientOnly = (file: string) => file.startsWith(path.join(root, 'src/admin') + path.sep) || file === path.join(root, 'src/exports/client.ts')
    const all = filesUnder(path.join(root, 'src'))
    const server = all.filter((file) => !clientOnly(file))
    expect(server.length).toBeGreaterThan(20)
    expect(all.filter(clientOnly).length).toBeGreaterThan(5)
    const bad: string[] = []
    for (const file of server) {
      for (const spec of runtimeImports(fs.readFileSync(file, 'utf8'))) {
        if (spec === 'react' || spec.startsWith('react/') || spec === 'react-dom' || spec === '@payloadcms/ui' || spec.startsWith('@payloadcms/ui/')) {
          bad.push(`${path.relative(root, file)}: ${spec}`)
        }
        // Server code must not reach the admin components through a relative import either.
        if (spec.startsWith('.') && clientOnly(path.resolve(path.dirname(file), spec).replace(/\.js$/, '.tsx'))) {
          bad.push(`${path.relative(root, file)}: ${spec}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

