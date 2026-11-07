import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

const dir = path.resolve(import.meta.dirname, '../.github/workflows')
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8')

type Step = { env?: Record<string, string>; name?: string; run?: string; uses?: string; with?: Record<string, unknown> }
type Workflow = {
  jobs: Record<string, { environment?: string; steps: Step[] }>
  on: Record<string, unknown>
  permissions?: Record<string, string>
}

const PACK_CHECK = 'npm pack --dry-run --json'

function runs(workflow: Workflow): string[] {
  return Object.values(workflow.jobs).flatMap((job) => job.steps.map((s) => s.run || ''))
}

function checks(workflow: Workflow) {
  const commands = runs(workflow).join('\n')
  for (const command of ['yarn install --immutable', 'yarn lint', 'yarn typecheck', 'yarn test', 'yarn build', 'yarn spec:validate', PACK_CHECK]) {
    expect(commands, command).toContain(command)
  }
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps)
  const node = steps.find((s) => s.uses?.startsWith('actions/setup-node'))
  expect(node?.with?.['node-version']).toBe(22)
  expect(commands).toContain('corepack enable')
}

describe('workflows', () => {
  test('ci runs every check without secrets', () => {
    const text = read('ci.yml')
    const ci = parse(text) as Workflow
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push'])
    checks(ci)
    expect(text).not.toMatch(/secrets\./)
    expect(text).not.toContain('npm publish')
  })

  test('publish runs only on version tags with the npm token', () => {
    const text = read('publish.yml')
    const publish = parse(text) as Workflow
    expect(publish.on).toEqual({ push: { tags: ['v*.*.*'] } })
    expect(publish.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
    const jobs = Object.values(publish.jobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.environment).toBe('npm')
    checks(publish)
    const steps = jobs[0]!.steps
    const publishIndex = steps.findIndex((s) => s.run?.includes('npm publish'))
    const tagIndex = steps.findIndex((s) => s.run?.includes('GITHUB_REF_NAME') && s.run.includes('package.json'))
    expect(publishIndex).toBeGreaterThan(-1)
    expect(tagIndex).toBeGreaterThan(-1)
    expect(tagIndex).toBeLessThan(publishIndex)
    expect(steps[publishIndex]!.run).toContain('npm publish --access public --provenance')
    expect(steps[publishIndex]!.env).toEqual({ NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}' })
    // The token reaches the publish step only.
    expect(text.match(/secrets\.NPM_TOKEN/g)).toHaveLength(1)
    expect(text.match(/secrets\./g)).toHaveLength(1)
    steps.forEach((step, i) => {
      if (i !== publishIndex) {
        expect(JSON.stringify(step)).not.toContain('secrets.')
      }
    })
  })

  test('only publish.yml publishes', () => {
    const files = fs.readdirSync(dir)
    expect(files.sort()).toEqual(['ci.yml', 'publish.yml'])
    for (const file of files) {
      expect(read(file).includes('npm publish'), file).toBe(file === 'publish.yml')
    }
  })
})
