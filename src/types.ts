import type {
  Block,
  CollectionConfig,
  CollectionSlug,
  Field,
  PayloadRequest,
  SendEmailOptions,
} from 'payload'

import type { Answers, FieldTypeChecks, FormWords, PublicForm } from './shared/types.js'

/** A new field type: its block plus the checks the server runs for it. */
export type FieldTypeDefinition = {
  /** The admin block. The plugin adds the common input fields (key, required, words, rules…). */
  block: Block
} & FieldTypeChecks

export type CollectionOverride = {
  /** Receives the plugin's fields and returns the field list to use. */
  fields?: (args: { defaultFields: Field[] }) => Field[]
} & Partial<Omit<CollectionConfig, 'fields'>>

export type OptionSource = {
  /** Extra fields of each item carried as option attributes (rules and tokens read them). */
  attributes?: string[]
  collection: CollectionSlug
  /** Field shown to the visitor. */
  labelField: string
  /** Field stored as the answer. */
  valueField: string
}

/** What a `webhooks.signingSecret` or `webhooks.headers` function receives for each webhook it is asked about. */
export type WebhookConfigArgs = {
  form: PublicForm
  req: PayloadRequest
  webhook: { id: null | string; label: null | string; url: string }
}

/** A value, or a (possibly async) function of the form, request and webhook returning one. */
export type WebhookConfigValue<T> =
  | ((args: WebhookConfigArgs) => Promise<T | undefined> | T | undefined)
  | T

export type WebhookOptions = {
  /**
   * Request headers for every webhook, e.g. an API key from an env var. The webhook's own admin
   * secret headers replace a config header of the same name (any case); neither can replace
   * `Content-Type`'s place first or the signature headers.
   */
  headers?: WebhookConfigValue<Record<string, string>>
  /**
   * `true` refuses to send a webhook that has no signing secret from either source: no request is
   * made and its delivery is logged as failed. Default `false`: it is sent unsigned, with one
   * warning per webhook per server process.
   */
  requireSignature?: boolean
  /**
   * Default `true`: each webhook row has the admin-only `signingSecret` and secret `headers`
   * fields, as in 0.1.0. `false` leaves both fields out of the forms collection, so secrets come
   * only from this config and none is stored in the database. Turning it off drops the column
   * and the headers table at the app's next migration; stored values are lost.
   */
  secretsInAdmin?: boolean
  /**
   * Signs any webhook whose admin signing secret is empty (the admin secret wins). A string, or a
   * function returning one, e.g. per webhook label. A `whsec_…` secret also keys the Standard
   * Webhooks signature with its decoded bytes.
   */
  signingSecret?: WebhookConfigValue<string>
}

export type FormsPluginOptions = {
  /**
   * Who may read and write webhook secrets in the admin, update or delete submissions and resend.
   * Default: any logged-in user. Prefer `webhooks.signingSecret` / `webhooks.headers` from env
   * vars (with `webhooks.secretsInAdmin: false`) over secrets stored in forms.
   */
  access?: { isAdmin?: (req: PayloadRequest) => boolean }
  /** Overrides for the attachments collection (when the plugin creates it). */
  attachmentOverrides?: CollectionOverride
  /** Private uploads for file fields. `false`: no attachments collection (file uploads can't be turned on). */
  attachments?:
    | {
        /** Use the app's own upload collection instead of creating one; the plugin adds its link fields. */
        collection?: CollectionSlug
        /** Largest file in bytes. Default 10 MB. */
        maxFileSize?: number
        /** Largest total per submission in bytes. Default 25 MB. */
        maxTotalSize?: number
        /** Allowed MIME types. Default: PDF, JPEG, PNG, WebP, text, CSV, Word. */
        mimeTypes?: string[]
      }
    | false
  /** Gets each email before it is sent (wrap it in a layout, add headers…) and returns the one to send. */
  beforeEmail?: (
    message: SendEmailOptions,
    ctx: { answers: Answers; form: PublicForm; req: PayloadRequest },
  ) => Promise<SendEmailOptions> | SendEmailOptions
  delivery?: {
    /**
     * Runs email and webhook delivery after the reply, e.g. `(task) => after(task)` (Next.js) or
     * `(task) => ctx.waitUntil(task())` (Workers). Default: delivery runs before the reply.
     */
    schedule?: (task: () => Promise<void>) => void
  }
  /** Default `true`. `false` returns the config untouched. */
  enabled?: boolean
  /**
   * Field-type registry keyed by type: `true`/`false` turns a built-in type on or off, a partial
   * block is merged into the built-in one, a full definition adds a new type. `fileUpload` is off
   * unless turned on.
   */
  fields?: Record<string, boolean | FieldTypeDefinition | Partial<Block>>
  /** Overrides for the forms collection. */
  formOverrides?: CollectionOverride
  /** Name of the honeypot field in a submission. Default `_hp`. */
  honeypotField?: string
  /** What a submission keeps about the request. Default: IP off, user agent on. */
  metadata?: { ip?: boolean; userAgent?: boolean }
  /** Collections whose items can be the choices of select, radio and checkbox-group fields. */
  optionSources?: Record<string, OptionSource>
  /** Per form and visitor. Default 5 per 600 s. `false` turns it off. */
  rateLimit?: { max?: number; windowSeconds?: number } | false
  /** Collection slugs. Default `custom-forms`, `custom-form-submissions`, `custom-form-attachments`. */
  slugs?: { attachments?: string; forms?: string; submissions?: string }
  /** Overrides for the submissions collection. */
  submissionOverrides?: CollectionOverride
  /** Cloudflare Turnstile checked on the server. On with no secret refuses every submission. */
  turnstile?: { enabled?: boolean; fieldName?: string; secretKey?: string }
  whatsapp?: {
    /** Number for forms that have none. */
    number?: (args: {
      form: PublicForm
      req: PayloadRequest
    }) => Promise<string | undefined> | string | undefined
  }
  /** Webhook secrets and headers from the config, and whether signing is required. */
  webhooks?: WebhookOptions
  /** Default words for new forms, merged over `DEFAULT_WORDS`. */
  words?: Partial<FormWords>
}

/** The options with every default applied. */
export type ResolvedOptions = {
  attachments: {
    collection: string
    createCollection: boolean
    maxFileSize: number
    maxTotalSize: number
    mimeTypes: string[]
  } | null
  fieldTypes: Record<string, FieldTypeChecks>
  honeypotField: string
  isAdmin: (req: PayloadRequest) => boolean
  metadata: { ip: boolean; userAgent: boolean }
  rateLimit: { max: number; windowSeconds: number } | null
  slugs: { attachments: string; forms: string; submissions: string }
  turnstile: { enabled: boolean; fieldName: string; secretKey: string }
  webhooks: {
    requireSignature: boolean
    secretsInAdmin: boolean
  } & Pick<WebhookOptions, 'headers' | 'signingSecret'>
  words: FormWords
} & Pick<FormsPluginOptions, 'beforeEmail' | 'delivery' | 'optionSources' | 'whatsapp'>
