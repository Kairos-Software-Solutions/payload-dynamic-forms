import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type App, startApp } from './helpers.js'

let app: App

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app?.payload.destroy()
})

describe('boot', () => {
  test('dev app boots with the plugin on SQLite', () => {
    expect(app.payload.db.name).toBe('sqlite')
    for (const slug of ['custom-forms', 'custom-form-submissions', 'custom-form-attachments']) {
      expect(app.payload.collections[slug as never]).toBeDefined()
    }
  })

  test('integration tests make no outside requests', async () => {
    const g = globalThis as { __outsideRequests?: string[] }
    // The guard is on: an outside request is refused and recorded …
    await expect(fetch('https://example.com/')).rejects.toThrow(/Outside request blocked/)
    expect(g.__outsideRequests).toEqual(['https://example.com/'])
    g.__outsideRequests!.length = 0
    // … and booting the app plus a round trip through the REST API made none.
    const res = await app.fetch('/custom-forms/public/nothing-here')
    expect(res.status).toBe(404)
    expect(g.__outsideRequests).toEqual([])
  })
})
