import type { CollectionConfig, Config, PayloadRequest } from 'payload'

import type { FormsPluginOptions, ResolvedOptions } from './types.js'

import { attachmentLinkFields, attachmentsCollection } from './collections/attachments.js'
import { buildFieldBlocks } from './collections/blocks.js'
import { formsCollection } from './collections/forms.js'
import { applyOverrides } from './collections/overrides.js'
import { submissionsCollection } from './collections/submissions.js'
import { publicFormEndpoint } from './endpoints/public.js'
import { resendEndpoint } from './endpoints/resend.js'
import { submitEndpoint } from './endpoints/submit.js'
import { DEFAULT_FILE_LIMITS } from './shared/answers.js'
import { DEFAULT_WORDS } from './shared/words.js'

export const DEFAULT_SLUGS = {
  attachments: 'custom-form-attachments',
  forms: 'custom-forms',
  submissions: 'custom-form-submissions',
} as const

export function resolveOptions(options: FormsPluginOptions = {}): ResolvedOptions {
  const slugs = { ...DEFAULT_SLUGS, ...options.slugs }
  const attachments =
    options.attachments === false
      ? null
      : {
          collection: options.attachments?.collection ? String(options.attachments.collection) : slugs.attachments,
          createCollection: !options.attachments?.collection,
          maxFileSize: options.attachments?.maxFileSize ?? DEFAULT_FILE_LIMITS.maxFileSize,
          maxTotalSize: options.attachments?.maxTotalSize ?? DEFAULT_FILE_LIMITS.maxTotalSize,
          mimeTypes: [...(options.attachments?.mimeTypes ?? DEFAULT_FILE_LIMITS.mimeTypes)],
        }
  if (attachments && !attachments.createCollection) {
    slugs.attachments = attachments.collection
  }
  return {
    attachments,
    beforeEmail: options.beforeEmail,
    delivery: options.delivery,
    fieldTypes: {},
    honeypotField: options.honeypotField || '_hp',
    isAdmin: options.access?.isAdmin || ((req: PayloadRequest) => Boolean(req.user)),
    metadata: { ip: options.metadata?.ip === true, userAgent: options.metadata?.userAgent !== false },
    optionSources: options.optionSources,
    rateLimit:
      options.rateLimit === false
        ? null
        : { max: options.rateLimit?.max ?? 5, windowSeconds: options.rateLimit?.windowSeconds ?? 600 },
    slugs,
    turnstile: {
      enabled: options.turnstile ? options.turnstile.enabled !== false : false,
      fieldName: options.turnstile?.fieldName || 'cf-turnstile-response',
      secretKey: options.turnstile?.secretKey || '',
    },
    whatsapp: options.whatsapp,
    words: { ...DEFAULT_WORDS, ...options.words },
  }
}

/**
 * Adds forms, submissions and private attachments, with their endpoints, to a Payload config.
 * `formsPlugin({ enabled: false })` returns the config untouched.
 */
export const formsPlugin =
  (pluginOptions: FormsPluginOptions = {}) =>
  (config: Config): Config => {
    if (pluginOptions.enabled === false) {
      return config
    }
    const options = resolveOptions(pluginOptions)
    const collections = [...(config.collections || [])]

    if (options.attachments && !options.attachments.createCollection) {
      const index = collections.findIndex((c) => c.slug === options.attachments!.collection)
      const target = collections[index]
      if (!target || !target.upload) {
        throw new Error(
          `formsPlugin: attachments.collection "${options.attachments.collection}" must be an upload collection in this config.`,
        )
      }
      const names = new Set(target.fields.map((f) => ('name' in f ? f.name : '')))
      collections[index] = {
        ...target,
        fields: [...target.fields, ...attachmentLinkFields(options).filter((f) => !('name' in f) || !names.has(f.name))],
      }
    }

    const { blocks, fieldTypes } = buildFieldBlocks(pluginOptions.fields, {
      attachmentsOn: Boolean(options.attachments),
      mimeTypes: options.attachments?.mimeTypes || [...DEFAULT_FILE_LIMITS.mimeTypes],
      sources: options.optionSources || {},
    })
    options.fieldTypes = fieldTypes

    const added: CollectionConfig[] = [
      applyOverrides(formsCollection(options, blocks, [submitEndpoint(options), publicFormEndpoint(options)]), pluginOptions.formOverrides),
      applyOverrides(submissionsCollection(options, [resendEndpoint(options)]), pluginOptions.submissionOverrides),
    ]
    if (options.attachments?.createCollection) {
      added.push(applyOverrides(attachmentsCollection(options), pluginOptions.attachmentOverrides))
    }

    return {
      ...config,
      collections: [...collections, ...added],
      custom: { ...config.custom, payloadForms: options },
    }
  }

export { signWebhookBody } from './delivery/webhook.js'
export { formBlock, type FormBlockOptions } from './formBlock.js'
export { getPublicForm, loadPublishedForm } from './server/forms.js'
export type {
  Answers,
  AnswerValue,
  ChoiceOption,
  FieldBlock,
  FieldTypeChecks,
  FieldWords,
  FormSection,
  FormWords,
  InputBlock,
  PublicForm,
  RuleGroup,
  RuleRow,
  SnapshotRow,
  SubmissionStatus,
  SubmitResult,
} from './shared/types.js'
export type { CollectionOverride, FieldTypeDefinition, FormsPluginOptions, OptionSource, ResolvedOptions } from './types.js'
