import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { getPublicForm } from '../../src/index.js'
import { type App, createForm, field, section, startApp } from './helpers.js'

let app: App

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app?.payload.destroy()
})

let n = 0
async function topic(label: string, fieldSet: 'item' | 'service', publish = true) {
  n += 1
  return app.payload.create({
    collection: 'topics' as never,
    data: {
      slug: `${label.toLowerCase().replace(/\s+/g, '-')}-${n}`,
      _status: publish ? 'published' : 'draft',
      closer: `Closer ${label}`,
      fieldSet,
      label,
      opener: `Opener ${label}`,
    } as never,
    draft: !publish,
    overrideAccess: true,
  }) as Promise<{ id: number; slug: string }>
}

async function radioForm(sourceItems: Array<{ id: number }>) {
  const form = await createForm(app, {
    sections: [
      section('s', [
        field('radio', 'need', {
          optionsFrom: 'topics',
          sourceItems: sourceItems.map((t) => ({ relationTo: 'topics', value: t.id })),
        }),
      ]),
    ],
  })
  const pub = await getPublicForm(app.payload, form.slug)
  return pub!.sections[0].fields![0] as { options: Array<{ attributes: Record<string, unknown>; label: string; value: string }> }
}

describe('option sources', () => {
  test('picked source items set the choices and their order', async () => {
    const a = await topic('Cameras', 'item')
    const b = await topic('Lens cleaning', 'service')
    const c = await topic('Tripods', 'item')
    const need = await radioForm([c, a, b])
    expect(need.options.map((o) => o.label)).toEqual(['Tripods', 'Cameras', 'Lens cleaning'])
    expect(need.options.map((o) => o.value)).toEqual([c.slug, a.slug, b.slug])
    expect(need.options[0]).toEqual({
      attributes: { closer: 'Closer Tripods', fieldSet: 'item', opener: 'Opener Tripods' },
      label: 'Tripods',
      value: c.slug,
    })
    expect(need).not.toHaveProperty('sourceItems')
  })

  test('empty pick lists all items in default sort', async () => {
    await topic('Flashes', 'item')
    await topic('Hidden draft', 'item', false)
    const need = await radioForm([])
    const { docs } = await app.payload.find({
      collection: 'topics' as never,
      depth: 0,
      pagination: false,
      where: { _status: { equals: 'published' } },
    })
    expect(need.options.map((o) => o.value)).toEqual(docs.map((d) => (d as unknown as { slug: string }).slug))
    expect(need.options.length).toBeGreaterThanOrEqual(4)
    expect(need.options.map((o) => o.label)).not.toContain('Hidden draft')
  })

  test('unpublished or deleted items are left out', async () => {
    const keep = await topic('Bags', 'item')
    const unpublish = await topic('Straps', 'item')
    const remove = await topic('Filters', 'item')
    await app.payload.update({ id: unpublish.id, collection: 'topics' as never, data: { _status: 'draft' } as never, overrideAccess: true })
    const form = await createForm(app, {
      sections: [
        section('s', [
          field('checkboxGroup', 'needs', {
            optionsFrom: 'topics',
            sourceItems: [remove, unpublish, keep].map((t) => ({ relationTo: 'topics', value: t.id })),
          }),
        ]),
      ],
    })
    await app.payload.delete({ id: remove.id, collection: 'topics' as never, overrideAccess: true })
    const pub = await getPublicForm(app.payload, form.slug)
    const needs = pub!.sections[0].fields![0] as { options: Array<{ label: string }> }
    expect(needs.options.map((o) => o.label)).toEqual(['Bags'])
  })
})
