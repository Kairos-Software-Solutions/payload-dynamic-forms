import { sqliteAdapter } from '@payloadcms/db-sqlite'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, type Config, type PayloadRequest } from 'payload'

import { type FormsPluginOptions, formsPlugin } from '../src/index.js'
import { testEmailAdapter } from './helpers/testEmailAdapter.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

type User = { role?: string }

/** Options the dev app (and the tests) start the plugin with. */
export const devPluginOptions: FormsPluginOptions = {
  access: { isAdmin: (req: PayloadRequest) => (req.user as User | null)?.role === 'admin' },
  attachmentOverrides: {
    upload: { staticDir: path.join(os.tmpdir(), 'payload-forms-dev-attachments') },
  },
  fields: { fileUpload: true },
  optionSources: {
    topics: {
      attributes: ['fieldSet', 'opener', 'closer', 'example'],
      collection: 'topics',
      labelField: 'label',
      valueField: 'slug',
    },
  },
  words: { send: 'Send now' },
}

export type DevConfigArgs = {
  /** SQLite file (default: a fresh file in the OS temp folder). */
  dbFile?: string
  /** Plugin options merged over `devPluginOptions`. */
  plugin?: FormsPluginOptions
  /** Extra collections (e.g. an app upload collection). */
  collections?: Config['collections']
}

export function buildDevConfig(args: DevConfigArgs = {}) {
  const dbFile =
    args.dbFile ||
    process.env.DATABASE_FILE ||
    path.join(os.tmpdir(), `payload-forms-${process.pid}-${Math.random().toString(36).slice(2)}.db`)
  return buildConfig({
    admin: {
      importMap: { baseDir: path.resolve(dirname) },
      user: 'users',
    },
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [
          {
            name: 'role',
            type: 'select',
            defaultValue: 'editor',
            options: ['admin', 'editor'],
            saveToJWT: true,
          },
        ],
      },
      {
        slug: 'topics',
        access: { read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }) },
        admin: { useAsTitle: 'label' },
        fields: [
          { name: 'label', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true, unique: true },
          { name: 'fieldSet', type: 'select', options: ['item', 'service'] },
          { name: 'opener', type: 'textarea' },
          { name: 'closer', type: 'textarea' },
          { name: 'example', type: 'text' },
        ],
        versions: { drafts: true },
      },
      ...(args.collections || []),
    ],
    db: sqliteAdapter({ client: { url: `file:${dbFile}` }, push: true }),
    email: testEmailAdapter,
    localization: { defaultLocale: 'en', fallback: true, locales: ['en', 'es'] },
    plugins: [formsPlugin({ ...devPluginOptions, ...args.plugin })],
    secret: process.env.PAYLOAD_SECRET || 'dev-only-secret-not-for-production',
    telemetry: false,
    typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  })
}

export default buildDevConfig()
