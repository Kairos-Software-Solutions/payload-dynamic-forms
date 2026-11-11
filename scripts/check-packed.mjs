#!/usr/bin/env node
// Packs the package (or takes a .tgz path), refuses a manifest whose entry fields name files the
// tarball doesn't hold (or that has no `./client` entry), then installs it with `payload`,
// `@payloadcms/ui` and `react` into a scratch ESM app outside the repo, imports the main and shared
// entries by name, resolves the client entry without running it (`@payloadcms/ui` imports .scss,
// which plain Node can't load) and typechecks all three. Needs the npm registry; not part of
// `yarn test`.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const repoPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const NAME = repoPkg.name

/** Runs a command; throws with its output when it fails. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}\n${output}`)
  }
  return result.stdout
}

/** Every string target of an `exports` value, with its path through nested conditions. */
function exportTargets(value, at = 'exports') {
  if (typeof value === 'string') {
    return [[at, value]]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => exportTargets(item, `${at}[${index}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => exportTargets(item, `${at}["${key}"]`))
  }
  return []
}

/** Errors for manifest entry fields that don't name a shipped, built file. */
export function manifestErrors(manifest, files) {
  const shipped = new Set(files)
  const targets = []
  for (const field of ['main', 'types']) {
    if (manifest[field] !== undefined) {
      targets.push([field, manifest[field]])
    }
  }
  targets.push(...exportTargets(manifest.exports))
  const errors = []
  for (const [field, target] of targets) {
    if (typeof target !== 'string') {
      errors.push(`${field}: ${JSON.stringify(target)} is not a path`)
      continue
    }
    const file = path.posix.normalize(target.replace(/^\.\//, ''))
    if (!shipped.has(file)) {
      errors.push(`${field}: ${target} is not in the tarball`)
    } else if (/^src\//.test(file)) {
      errors.push(`${field}: ${target} points into ./src/`)
    } else if (/\.ts$/.test(file) && !/\.d\.ts$/.test(file)) {
      errors.push(`${field}: ${target} is TypeScript source, not a built file`)
    }
  }
  if (!manifest.main && !manifest.exports) {
    errors.push('main and exports: neither is set')
  }
  if (!manifest.exports || typeof manifest.exports !== 'object' || !manifest.exports['./client']) {
    errors.push('exports["./client"]: missing (the admin components entry)')
  }
  return errors
}

function main(argv) {
  const started = Date.now()
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-packed-'))
  try {
    let tarball = argv[0] ? path.resolve(argv[0]) : undefined
    if (!tarball) {
      const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', scratch], { cwd: root }))
      tarball = path.join(scratch, packed[0].filename)
    }
    if (!fs.existsSync(tarball)) {
      throw new Error(`${tarball} does not exist`)
    }
    const files = run('tar', ['-tzf', tarball])
      .split('\n')
      .filter(Boolean)
      .filter((entry) => !entry.endsWith('/'))
      .map((entry) => entry.replace(/^package\//, ''))
    const manifest = JSON.parse(run('tar', ['-xzf', tarball, '-O', 'package/package.json']))
    const errors = manifestErrors(manifest, files)
    if (errors.length) {
      console.error(`${manifest.name}@${manifest.version}: the manifest names files the tarball doesn't ship:`)
      for (const error of errors) {
        console.error(`  ${error}`)
      }
      return 1
    }

    // A scratch ESM app outside the repo, installing from the public registry with an empty user
    // config (in CI, setup-node's .npmrc carries a placeholder token that a public install must not send).
    const app = path.join(scratch, 'app')
    fs.mkdirSync(app)
    fs.writeFileSync(path.join(app, 'package.json'), `${JSON.stringify({ name: 'packed-check', type: 'module', private: true }, null, 2)}\n`)
    const userconfig = path.join(scratch, 'empty-npmrc')
    fs.writeFileSync(userconfig, '')
    const env = { ...process.env, NPM_CONFIG_USERCONFIG: userconfig }
    delete env.npm_config_userconfig
    run(
      'npm',
      [
        'install',
        tarball,
        `payload@${repoPkg.devDependencies.payload}`,
        `@payloadcms/ui@${repoPkg.devDependencies['@payloadcms/ui']}`,
        `react@${repoPkg.devDependencies.react}`,
        `react-dom@${repoPkg.devDependencies['react-dom']}`,
        `@types/react@${repoPkg.devDependencies['@types/react']}`,
        `typescript@${repoPkg.devDependencies.typescript}`,
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--registry=https://registry.npmjs.org/',
      ],
      { cwd: app, env },
    )

    // Both entries import by package name and resolve into dist/.
    const probe = `
      const main = await import('${NAME}')
      const shared = await import('${NAME}/shared')
      const missing = []
      for (const name of ['formsPlugin', 'formBlock', 'getPublicForm']) if (main[name] === undefined) missing.push('${NAME}: ' + name)
      for (const name of ['evaluateRules', 'buildWhatsAppMessage', 'whatsappUrl', 'interpolate', 'DEFAULT_WORDS']) if (shared[name] === undefined) missing.push('${NAME}/shared: ' + name)
      // The client entry is resolved, not imported: it pulls in @payloadcms/ui, which imports .scss.
      const resolved = [import.meta.resolve('${NAME}'), import.meta.resolve('${NAME}/shared'), import.meta.resolve('${NAME}/client')]
      const expected = ['/node_modules/${NAME}/dist/index.js', '/node_modules/${NAME}/dist/exports/shared.js', '/node_modules/${NAME}/dist/exports/client.js']
      resolved.forEach((url, i) => { if (!url.endsWith(expected[i])) missing.push('resolves to ' + url + ', expected …' + expected[i]) })
      if (missing.length) { console.error(missing.join('\\n')); process.exit(1) }
    `
    run(process.execPath, ['--input-type=module', '-e', probe], { cwd: app })

    // The client entry keeps its directive, so Next treats the admin components as client code.
    const clientFile = path.join(app, 'node_modules', NAME, 'dist', 'exports', 'client.js')
    const firstLine = fs.readFileSync(clientFile, 'utf8').split('\n')[0].trim()
    if (!/^(['"])use client\1;?$/.test(firstLine)) {
      throw new Error(`${NAME}/client: the first line of dist/exports/client.js is ${JSON.stringify(firstLine)}, not 'use client'`)
    }

    // Types resolve for both entries (a missing declaration is TS7016 under strict).
    fs.writeFileSync(
      path.join(app, 'check.ts'),
      [
        `import { formsPlugin } from '${NAME}'`,
        `import { KeyField, NoAnswerHint, PrefillParamField, RuleFieldKeyField, SectionTargetField } from '${NAME}/client'`,
        `import { evaluateRules } from '${NAME}/shared'`,
        '',
        'export const used: [typeof formsPlugin, typeof evaluateRules] = [formsPlugin, evaluateRules]',
        'export const components = [KeyField, PrefillParamField, RuleFieldKeyField, SectionTargetField, NoAnswerHint] as const',
        '',
      ].join('\n'),
    )
    fs.writeFileSync(
      path.join(app, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', noEmit: true, skipLibCheck: true, strict: true, target: 'es2022' },
          files: ['check.ts'],
        },
        null,
        2,
      )}\n`,
    )
    run(process.execPath, [path.join(app, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'], { cwd: app })

    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`ok ${files.length} files, 3 entries resolve, types resolve (${scratch})`)
    console.error(`(${seconds} s)`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    // The scratch dir holds the app and, when this script packed, the .tgz it made.
    fs.rmSync(scratch, { force: true, recursive: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2))
}
