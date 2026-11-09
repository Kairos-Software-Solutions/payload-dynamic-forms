import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

const dir = path.resolve(import.meta.dirname, '../.github/workflows')
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8')

type Step = {
  env?: Record<string, string>
  id?: string
  if?: string
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
type Workflow = {
  jobs: Record<string, { environment?: string; steps: Step[] }>
  on: Record<string, unknown>
  permissions?: Record<string, string>
}

const PACK_CHECK = 'npm pack --dry-run --json'
const CHECKS = ['yarn install --immutable', 'yarn lint', 'yarn typecheck', 'yarn test', 'yarn build', 'yarn spec:validate', PACK_CHECK]

function runs(workflow: Workflow): string[] {
  return Object.values(workflow.jobs).flatMap((job) => job.steps.map((s) => s.run || ''))
}

function checks(workflow: Workflow, nodeVersion: number) {
  const commands = runs(workflow).join('\n')
  for (const command of CHECKS) {
    expect(commands, command).toContain(command)
  }
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps)
  const node = steps.find((s) => s.uses?.startsWith('actions/setup-node'))
  expect(node?.with?.['node-version']).toBe(nodeVersion)
  expect(commands).toContain('corepack enable')
}

function release() {
  const text = read('release.yml')
  const workflow = parse(text) as Workflow
  const jobs = Object.values(workflow.jobs)
  expect(jobs).toHaveLength(1)
  const steps = jobs[0].steps
  const index = (match: (s: Step) => boolean) => {
    const i = steps.findIndex(match)
    expect(i).toBeGreaterThan(-1)
    return i
  }
  return { index, jobs, steps, text, workflow }
}

describe('workflows', () => {
  test('ci runs every check without secrets', () => {
    const text = read('ci.yml')
    const ci = parse(text) as Workflow
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push'])
    checks(ci, 22)
    expect(text).not.toMatch(/secrets\./)
    expect(text).not.toContain('npm publish')
  })

  test('release publishes a new version from main and skips a tagged one', () => {
    const { index, steps, workflow } = release()
    expect(workflow.on).toEqual({
      push: { branches: ['main'], tags: ['v*.*.*'] },
      workflow_dispatch: null,
    })
    checks(workflow, 24)

    // Tags are fetched so the "tag exists" check can see them.
    const checkout = steps[index((s) => !!s.uses?.startsWith('actions/checkout'))]
    expect(checkout.with?.['fetch-depth']).toBe(0)

    const prepareIndex = index((s) => s.id === 'release')
    const prepare = steps[prepareIndex].run!
    // A pushed tag must equal the package version.
    expect(prepare).toContain(`require('./package.json').version`)
    expect(prepare).toMatch(/GITHUB_REF_TYPE" == "tag"/)
    expect(prepare).toMatch(/"\$GITHUB_REF_NAME" != "\$package_tag"[\s\S]*?exit 1/)
    // A branch push whose v<version> tag exists publishes nothing.
    expect(prepare).toMatch(/git show-ref --verify --quiet "refs\/tags\/\$package_tag"; then\s+echo "publish=false"/)

    // Every step after "prepare" (install included) runs only when there is something to publish.
    const installIndex = index((s) => s.run === 'yarn install --immutable')
    expect(prepareIndex).toBeLessThan(installIndex)
    steps.slice(0, prepareIndex).forEach((s) => expect(s.run ?? '', s.name).not.toMatch(/yarn|npm (ci|install|publish)/))
    const publishIndex = index((s) => !!s.run?.includes('npm publish'))
    const tagIndex = index((s) => !!s.run?.includes('git tag') && s.run.includes('push origin'))
    for (const step of steps.slice(prepareIndex + 1)) {
      const gate = step.run?.includes('git tag') ? 'create_tag' : 'publish'
      expect(step.if, step.name).toBe(`steps.release.outputs.${gate} == 'true'`)
    }
    // Every check runs before the publish, and the tag is created only after it.
    for (const command of CHECKS) {
      expect(index((s) => !!s.run?.includes(command)), command).toBeLessThan(publishIndex)
    }
    expect(publishIndex).toBeLessThan(tagIndex)
    expect(tagIndex).toBe(steps.length - 1)
  })

  test('release uses trusted publishing with no secrets', () => {
    const { index, jobs, steps, text, workflow } = release()
    expect(workflow.permissions).toEqual({ contents: 'write', 'id-token': 'write' })
    for (const job of jobs) {
      expect(job).not.toHaveProperty('environment')
    }
    expect(text).not.toMatch(/^\s*environment:/m)
    const publishIndex = index((s) => !!s.run?.includes('npm publish'))
    expect(steps[publishIndex].run).toBe('npm publish --access public --provenance')
    // The trusted publisher on npmjs.com replaces the token: no env on the publish step.
    expect(steps[publishIndex]).not.toHaveProperty('env')
    expect(text).not.toContain('secrets.')
    expect(text).not.toContain('NPM_TOKEN')
    expect(text).not.toContain('NODE_AUTH_TOKEN')
    // setup-node writes the registry .npmrc that npm publish reads.
    const node = steps.find((s) => s.uses?.startsWith('actions/setup-node'))
    expect(node?.with?.['registry-url']).toBe('https://registry.npmjs.org')
  })

  test('only release.yml publishes', () => {
    const files = fs.readdirSync(dir)
    expect(files.sort()).toEqual(['ci.yml', 'release.yml'])
    expect(fs.existsSync(path.join(dir, 'publish.yml'))).toBe(false)
    for (const file of files) {
      expect(read(file).includes('npm publish'), file).toBe(file === 'release.yml')
    }
  })
})
