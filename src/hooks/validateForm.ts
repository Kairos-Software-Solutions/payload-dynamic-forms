import type { CollectionBeforeValidateHook } from 'payload'

import { ValidationError } from 'payload'

import type { FieldBlock, FormSection, InputBlock, RuleGroup } from '../shared/types.js'
import type { ResolvedOptions } from '../types.js'

import { isInputBlock, normalizeKey, splitRuleKey } from '../shared/rules.js'

type Issue = { message: string; path: string }

type EmailOutput = {
  bcc?: null | string
  cc?: null | string
  from?: null | string
  kind?: 'team' | 'visitor' | null
  label?: null | string
  replyToField?: null | string
  to?: null | string
  visitorField?: null | string
}

type Webhook = { label?: null | string; url?: null | string }

type FormData = {
  delivery?: { emails?: EmailOutput[] | null; store?: boolean | null; webhooks?: null | Webhook[] } | null
  sections?: FormSection[] | null
}

function normalizeRuleKeys(group: null | RuleGroup | undefined): void {
  for (const row of group?.rows || []) {
    if (!row || typeof row.fieldKey !== 'string') {
      continue
    }
    const { attribute, key } = splitRuleKey(row.fieldKey)
    row.fieldKey = attribute ? `${key}.${attribute}` : key
  }
}

/** Finds a cycle in the step graph (next-step rules plus the fall-through to the next section). */
function findLoop(sections: FormSection[]): null | string[] {
  const keys = sections.map((s) => normalizeKey(s.key))
  const edges = new Map<string, Set<string>>()
  keys.forEach((key, index) => {
    const out = new Set<string>()
    for (const rule of sections[index].nextStepRules || []) {
      const target = normalizeKey(rule?.targetSectionKey)
      if (target && keys.includes(target)) {
        out.add(target)
      }
    }
    if (keys[index + 1]) {
      out.add(keys[index + 1])
    }
    edges.set(key, out)
  })
  const state = new Map<string, 'done' | 'open'>()
  const stack: string[] = []
  const visit = (key: string): null | string[] => {
    state.set(key, 'open')
    stack.push(key)
    for (const next of edges.get(key) || []) {
      if (state.get(next) === 'open') {
        return [...stack.slice(stack.indexOf(next)), next]
      }
      if (!state.has(next)) {
        const found = visit(next)
        if (found) {
          return found
        }
      }
    }
    stack.pop()
    state.set(key, 'done')
    return null
  }
  for (const key of keys) {
    if (!state.has(key)) {
      const found = visit(key)
      if (found) {
        return found
      }
    }
  }
  return null
}

const TOKEN = /\{\{/

/**
 * Save checks: normalise keys to kebab-case, then refuse duplicate or reserved keys, rules and
 * step targets naming missing keys, step loops, tokens in addresses, a visitor copy without an
 * email field, uploads on a form that does not store, and webhooks that are not https.
 */
export function validateFormBeforeSave(options: ResolvedOptions): CollectionBeforeValidateHook {
  const reserved = [options.honeypotField, options.turnstile.fieldName].map((name) => name.trim().toLowerCase())

  return ({ collection, data, originalDoc, req }) => {
    if (!data) {
      return data
    }
    const form = data as FormData
    const original = (originalDoc || {}) as FormData
    const issues: Issue[] = []
    const sections = Array.isArray(form.sections) ? form.sections : original.sections || []

    // Keys, duplicates, reserved names.
    const sectionKeys = new Set<string>()
    const fieldTypes = new Map<string, string>()
    sections.forEach((section, s) => {
      if (!section) {
        return
      }
      section.key = normalizeKey(section.key)
      if (section.key && sectionKeys.has(section.key)) {
        issues.push({ message: `Two sections use the key "${section.key}".`, path: `sections.${s}.key` })
      }
      sectionKeys.add(section.key || '')
      ;(section.fields || []).forEach((field: FieldBlock, f) => {
        if (!isInputBlock(field)) {
          return
        }
        const raw = typeof field.fieldKey === 'string' ? field.fieldKey.trim().toLowerCase() : ''
        const key = normalizeKey(field.fieldKey)
        field.fieldKey = key
        const path = `sections.${s}.fields.${f}.fieldKey`
        if (reserved.includes(raw) || reserved.includes(key)) {
          issues.push({ message: `The key "${raw || key}" is reserved for the spam checks. Pick another key.`, path })
          return
        }
        if (key && fieldTypes.has(key)) {
          issues.push({ message: `Two fields use the key "${key}".`, path })
          return
        }
        if (key) {
          fieldTypes.set(key, field.blockType)
        }
      })
    })

    // Rules and step targets.
    const checkRules = (group: null | RuleGroup | undefined, path: string) => {
      normalizeRuleKeys(group)
      ;(group?.rows || []).forEach((row, r) => {
        const { key } = splitRuleKey(row?.fieldKey)
        if (key && !fieldTypes.has(key)) {
          issues.push({ message: `A rule names the field key "${key}", which this form does not have.`, path: `${path}.rows.${r}.fieldKey` })
        }
      })
    }
    sections.forEach((section, s) => {
      if (!section) {
        return
      }
      checkRules(section.visibilityRules, `sections.${s}.visibilityRules`)
      ;(section.fields || []).forEach((field: FieldBlock, f) => {
        if (isInputBlock(field)) {
          checkRules((field).visibilityRules, `sections.${s}.fields.${f}.visibilityRules`)
        }
      })
      ;(section.nextStepRules || []).forEach((rule, r) => {
        if (!rule) {
          return
        }
        checkRules(rule, `sections.${s}.nextStepRules.${r}`)
        rule.targetSectionKey = normalizeKey(rule.targetSectionKey)
        if (rule.targetSectionKey && !sectionKeys.has(rule.targetSectionKey)) {
          issues.push({
            message: `A next-step rule targets the section key "${rule.targetSectionKey}", which this form does not have.`,
            path: `sections.${s}.nextStepRules.${r}.targetSectionKey`,
          })
        }
      })
    })
    const loop = findLoop(sections.filter(Boolean))
    if (loop) {
      issues.push({ message: `The next-step rules make a loop: ${loop.join(' → ')}.`, path: 'sections' })
    }

    // Delivery.
    const delivery = form.delivery ?? original.delivery ?? {}
    const store = delivery.store !== false
    if (!store) {
      for (const [key, type] of fieldTypes) {
        if (type === 'fileUpload') {
          issues.push({ message: `The upload field "${key}" needs "Store submissions" on.`, path: 'delivery.store' })
        }
      }
    }
    ;(delivery.emails || []).forEach((email, e) => {
      if (!email) {
        return
      }
      for (const name of ['to', 'cc', 'bcc', 'from'] as const) {
        const value = email[name]
        if (typeof value === 'string' && TOKEN.test(value)) {
          issues.push({
            message: `Email "${email.label || e + 1}": ${name} can't hold {{tokens}}. To write to the visitor, use a visitor copy instead.`,
            path: `delivery.emails.${e}.${name}`,
          })
        }
      }
      if (email.kind === 'visitor') {
        const key = normalizeKey(email.visitorField)
        email.visitorField = key
        if (fieldTypes.get(key) !== 'email') {
          issues.push({
            message: `Email "${email.label || e + 1}": the visitor copy needs the key of an email field ("${key}" is not one).`,
            path: `delivery.emails.${e}.visitorField`,
          })
        }
      } else if (!email.to?.trim()) {
        issues.push({ message: `Email "${email.label || e + 1}": add at least one address in "to".`, path: `delivery.emails.${e}.to` })
      }
      if (email.replyToField) {
        const key = normalizeKey(email.replyToField)
        email.replyToField = key
        if (fieldTypes.get(key) !== 'email') {
          issues.push({ message: `Email "${email.label || e + 1}": reply-to needs the key of an email field ("${key}" is not one).`, path: `delivery.emails.${e}.replyToField` })
        }
      }
    })
    ;(delivery.webhooks || []).forEach((hook, w) => {
      if (!hook) {
        return
      }
      let ok = false
      try {
        ok = new URL(String(hook.url || '')).protocol === 'https:'
      } catch {
        ok = false
      }
      if (!ok) {
        issues.push({ message: `Webhook "${hook.label || w + 1}": the URL ${hook.url || '(empty)'} must start with https://.`, path: `delivery.webhooks.${w}.url` })
      }
    })

    if (issues.length) {
      throw new ValidationError({ collection: collection.slug, errors: issues, req })
    }
    return data
  }
}
