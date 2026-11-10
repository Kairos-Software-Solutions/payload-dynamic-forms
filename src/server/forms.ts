import type { Payload, PayloadRequest, TypedLocale, Where } from 'payload'

import { createLocalReq } from 'payload'

import type { ChoiceOption, FormSection, InputBlock, PublicForm } from '../shared/types.js'
import type { ResolvedOptions } from '../types.js'

import { isChoiceBlock, isInputBlock } from '../shared/rules.js'
import { fillWords } from '../shared/words.js'

export type EmailOutput = {
  bcc?: null | string
  body?: null | string
  cc?: null | string
  enabled?: boolean | null
  from?: null | string
  id?: null | string
  kind?: 'team' | 'visitor' | null
  label?: null | string
  replyToField?: null | string
  subject?: null | string
  to?: null | string
  visitorField?: null | string
}

export type WebhookOutput = {
  enabled?: boolean | null
  headers?: Array<{ key?: null | string; value?: null | string }> | null
  id?: null | string
  label?: null | string
  method?: 'PATCH' | 'POST' | 'PUT' | null
  payloadMode?: 'answersOnly' | 'full' | null
  retries?: null | number
  signingSecret?: null | string
  timeoutMs?: null | number
  url?: null | string
}

export type FormDelivery = {
  emails: EmailOutput[]
  store: boolean
  webhooks: WebhookOutput[]
  whatsapp: { enabled: boolean; messageTemplate?: null | string; number?: null | string; rowTemplate?: null | string }
}

export type LoadedForm = {
  delivery: FormDelivery
  form: PublicForm
}

type RawForm = {
  _status?: string
  delivery?: null | Partial<FormDelivery>
  id: number | string
  intakeState?: 'closed' | 'open' | null
  presentationMode?: 'singlePage' | 'steps' | null
  sections?: FormSection[] | null
  slug?: null | string
  successRedirectURL?: null | string
  successType?: 'message' | 'redirect' | null
  title?: null | string
  wording?: null | Record<string, null | string>
}

type Locale = 'all' | TypedLocale | undefined

/** The plugin options of an app, kept on its config by `formsPlugin`. */
export function getPluginOptions(payload: Payload): ResolvedOptions {
  const options = (payload.config.custom as { payloadForms?: ResolvedOptions } | undefined)?.payloadForms
  if (!options) {
    throw new Error('payload-dynamic-forms: formsPlugin is not installed (or is switched off) in this config.')
  }
  return options
}

/**
 * The locale the plugin reads and stores: `value` when it is one of the app's locale codes, the
 * default locale for anything else (`all`, `*`, empty, unknown), and none without localization.
 */
export function pluginLocale(payload: Payload, value: unknown): TypedLocale | undefined {
  const localization = payload.config.localization
  if (!localization) {
    return undefined
  }
  return typeof value === 'string' && localization.localeCodes.includes(value)
    ? (value as TypedLocale)
    : (localization.defaultLocale as TypedLocale)
}

function pick(doc: Record<string, unknown>, names: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of names) {
    if (doc[name] !== undefined && doc[name] !== null) {
      out[name] = doc[name]
    }
  }
  return out
}

/**
 * Turns source-based choices into `{ label, value, attributes }`: picked items in their order, or
 * every published item in the source's default sort when the pick is empty. Unpublished and
 * missing items are left out.
 */
async function resolveChoices(payload: Payload, options: ResolvedOptions, sections: FormSection[], locale: Locale) {
  const sources = options.optionSources || {}
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (!isInputBlock(field) || !isChoiceBlock(field)) {
        continue
      }
      const block = field as { sourceItems?: unknown } & InputBlock
      const sourceKey = block.optionsFrom
      const source = sourceKey && sourceKey !== 'typed' ? sources[sourceKey] : undefined
      const picked = Array.isArray(block.sourceItems) ? block.sourceItems : []
      delete block.sourceItems
      if (!source) {
        block.options = (block.options || []).map((o: ChoiceOption) => ({ label: o.label, value: o.value }))
        continue
      }
      const slug = String(source.collection)
      const config = payload.collections[slug as never]?.config
      if (!config) {
        block.options = []
        continue
      }
      const ids = picked
        .filter((item: { relationTo?: string }) => item && item.relationTo === slug)
        .map((item: { value: unknown }) =>
          item.value && typeof item.value === 'object' ? (item.value as { id: number | string }).id : item.value,
        ) as Array<number | string>
      const and: Where[] = []
      if (picked.length) {
        and.push({ id: { in: ids.length ? ids : [-1] } })
      }
      if (config.versions?.drafts) {
        and.push({ _status: { equals: 'published' } })
      }
      // Trusted read of the items the editor picked: only label, value and listed attributes leave it.
      const { docs } = await payload.find({
        collection: slug as never,
        depth: 0,
        draft: false,
        locale: locale as never,
        overrideAccess: true,
        pagination: false,
        where: and.length ? { and } : undefined,
      })
      const byId = new Map(docs.map((doc) => [String((doc as { id: unknown }).id), doc as Record<string, unknown>]))
      const ordered = picked.length
        ? ids.map((id) => byId.get(String(id))).filter((d): d is Record<string, unknown> => Boolean(d))
        : (docs as Record<string, unknown>[])
      block.options = ordered
        .map((doc) => ({
          attributes: pick(doc, source.attributes),
          label: String(doc[source.labelField] ?? ''),
          value: String(doc[source.valueField] ?? ''),
        }))
        .filter((o) => o.value)
    }
  }
}

async function buildLoaded(
  payload: Payload,
  options: ResolvedOptions,
  raw: RawForm,
  locale: Locale,
  req?: PayloadRequest,
): Promise<LoadedForm> {
  const sections = structuredClone(raw.sections || []).filter(Boolean)
  await resolveChoices(payload, options, sections, locale)
  const d = raw.delivery || {}
  const delivery: FormDelivery = {
    emails: (d.emails || []).filter(Boolean),
    store: d.store !== false,
    webhooks: (d.webhooks || []).filter(Boolean),
    whatsapp: { enabled: false, ...(d.whatsapp || {}) },
  }
  const sends =
    delivery.emails.some((e) => e.enabled !== false) || delivery.webhooks.some((w) => w.enabled !== false)
  const form: PublicForm = {
    id: raw.id,
    slug: String(raw.slug || ''),
    honeypotField: options.honeypotField,
    intakeState: raw.intakeState === 'closed' ? 'closed' : 'open',
    presentationMode: raw.presentationMode === 'steps' ? 'steps' : 'singlePage',
    sections,
    spamChecks: delivery.store || sends,
    successRedirectURL: raw.successType === 'redirect' ? raw.successRedirectURL || null : null,
    successType: raw.successType === 'redirect' ? 'redirect' : 'message',
    title: String(raw.title || ''),
    turnstile: { enabled: options.turnstile.enabled, fieldName: options.turnstile.fieldName },
    wording: fillWords(raw.wording as never, options.words),
  }
  if (delivery.whatsapp.enabled) {
    let number = delivery.whatsapp.number?.trim() || ''
    if (!number && options.whatsapp?.number) {
      const request = req || (await createLocalReq({}, payload))
      number = String((await options.whatsapp.number({ form, req: request })) || '').trim()
    }
    if (number) {
      form.whatsapp = { number }
    }
  }
  return { delivery, form }
}

/**
 * Loads a published form by slug, as a visitor would see it, plus its delivery settings for the
 * server. Null when the slug is unknown or the form is not published.
 */
export async function loadPublishedForm(
  payload: Payload,
  slug: string,
  args: { locale?: Locale; req?: PayloadRequest } = {},
): Promise<LoadedForm | null> {
  const options = getPluginOptions(payload)
  // Read as an anonymous visitor: access control decides, delivery fields are stripped.
  const { docs } = await payload.find({
    collection: options.slugs.forms as never,
    depth: 0,
    draft: false,
    limit: 1,
    locale: args.locale as never,
    overrideAccess: false,
    pagination: false,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  })
  const visible = docs[0] as RawForm | undefined
  if (!visible) {
    return null
  }
  // Server-side read of the same published document for its delivery settings and secrets.
  const full = (await payload.findByID({
    id: visible.id,
    collection: options.slugs.forms as never,
    depth: 0,
    draft: false,
    locale: args.locale as never,
    overrideAccess: true,
  })) as unknown as RawForm
  return buildLoaded(payload, options, { ...full, id: visible.id }, args.locale, args.req)
}

/** Loads a form by id with its delivery settings (trusted server use: resend). */
export async function loadFormById(
  payload: Payload,
  id: number | string,
  args: { locale?: Locale; req?: PayloadRequest } = {},
): Promise<LoadedForm | null> {
  const options = getPluginOptions(payload)
  try {
    const full = (await payload.findByID({
      id,
      collection: options.slugs.forms as never,
      depth: 0,
      draft: false,
      locale: args.locale as never,
      overrideAccess: true,
    })) as unknown as RawForm
    return full ? buildLoaded(payload, options, full, args.locale, args.req) : null
  } catch {
    return null
  }
}

/**
 * A published form ready to render: sections, choices from sources resolved with their
 * attributes, words filled from the defaults, the WhatsApp number when WhatsApp is on, and none of
 * its other delivery settings. Null for unknown or unpublished slugs.
 */
export async function getPublicForm(
  payload: Payload,
  slug: string,
  args: { locale?: Locale; req?: PayloadRequest } = {},
): Promise<null | PublicForm> {
  const loaded = await loadPublishedForm(payload, slug, args)
  return loaded ? loaded.form : null
}
