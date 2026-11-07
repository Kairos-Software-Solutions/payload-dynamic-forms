import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return filesUnder(full)
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

/** Runtime import specifiers (type-only imports and exports are left out). */
function runtimeImports(source: string): string[] {
  const out: string[] = []
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of source.matchAll(re)) {
    if (m[5] || m[6]) {
      out.push((m[5] || m[6])!)
      continue
    }
    if (m[2]) {
      continue
    }
    const clause = m[3] || ''
    const braces = clause.match(/^\{([\s\S]*)\}$/)
    if (braces && braces[1]!.split(',').every((part) => !part.trim() || /^type\s/.test(part.trim()))) {
      continue
    }
    out.push(m[4]!)
  }
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
      for (const pattern of [/\brequire\(\s*['"](?:node:)?(fs|path|child_process)['"]/, /\bprocess\.cwd\s*\(/, /\bfrom\s+['"](?:node:)?(fs|path|child_process)(?:\/[^'"]*)?['"]/]) {
        if (pattern.test(source)) {
          bad.push(`${path.relative(root, file)}: ${pattern}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})
