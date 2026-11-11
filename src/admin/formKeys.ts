/**
 * Pick-list choices built from the admin's form state (no React here). Form-state paths are
 * flat: `sections.<s>.key`, `sections.<s>.fields.<f>.fieldKey`, `...blockType`, `...optionsFrom`.
 * Unsaved edits are in the form state, so they show at once.
 */
import { normalizeKey } from '../shared/rules.js'

/** The part of Payload's form state these helpers read: path → `{ value }`. */
export type FormStateLike = Record<string, { value?: unknown } | undefined>

export type FieldKeyOption = {
  /** The field takes its choices from a collection, so a rule may name one of their attributes. */
  hasAttributes: boolean
  key: string
}

const DISPLAY_TYPES = ['heading', 'helpText']
const FIELD_PATH = /^sections\.(\d+)\.fields\.(\d+)\.fieldKey$/
const SECTION_PATH = /^sections\.(\d+)\.key$/

function valueAt(state: FormStateLike, path: string): unknown {
  return state[path]?.value
}

/** Keys of the form's input fields, normalised, each once, in form order. */
export function fieldKeyOptions(state: FormStateLike): FieldKeyOption[] {
  const found: { f: number; option: FieldKeyOption; s: number }[] = []
  for (const path of Object.keys(state)) {
    const match = FIELD_PATH.exec(path)
    if (!match) {
      continue
    }
    const base = path.slice(0, -'fieldKey'.length)
    const blockType = valueAt(state, `${base}blockType`)
    if (typeof blockType === 'string' && DISPLAY_TYPES.includes(blockType)) {
      continue
    }
    const key = normalizeKey(valueAt(state, path))
    if (!key) {
      continue
    }
    const from = valueAt(state, `${base}optionsFrom`)
    found.push({
      f: Number(match[2]),
      option: { hasAttributes: typeof from === 'string' && from !== '' && from !== 'typed', key },
      s: Number(match[1]),
    })
  }
  found.sort((a, b) => a.s - b.s || a.f - b.f)
  const seen = new Set<string>()
  return found.map((x) => x.option).filter((o) => !seen.has(o.key) && Boolean(seen.add(o.key)))
}

/** Section keys, normalised, each once, in form order, without the section at `ownSectionIndex`. */
export function sectionKeyOptions(state: FormStateLike, ownSectionIndex?: number): string[] {
  const found: { key: string; s: number }[] = []
  for (const path of Object.keys(state)) {
    const match = SECTION_PATH.exec(path)
    if (!match || Number(match[1]) === ownSectionIndex) {
      continue
    }
    const key = normalizeKey(valueAt(state, path))
    if (key) {
      found.push({ key, s: Number(match[1]) })
    }
  }
  found.sort((a, b) => a.s - b.s)
  return [...new Set(found.map((x) => x.key))]
}

/** The section index in a field path such as `sections.2.nextStepRules.0.targetSectionKey`. */
export function sectionIndexOf(path: string): number | undefined {
  const match = /^sections\.(\d+)\./.exec(path)
  return match ? Number(match[1]) : undefined
}

/** The path of a sibling field in the same row: `a.b.prefillParam` + `fieldKey` → `a.b.fieldKey`. */
export function siblingPath(path: string, name: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? name : `${path.slice(0, dot + 1)}${name}`
}

/** Splits a stored rule key into its field key and attribute (`need.fieldSet`). */
export function splitStoredRuleKey(value: unknown): { attribute: string; key: string } {
  const text = typeof value === 'string' ? value.trim() : ''
  const dot = text.indexOf('.')
  return dot === -1 ? { attribute: '', key: text } : { attribute: text.slice(dot + 1), key: text.slice(0, dot) }
}

/** The stored rule key: `key`, or `key.attribute` when an attribute is given. */
export function joinRuleKey(key: string, attribute: string): string {
  const a = attribute.trim()
  return key && a ? `${key}.${a}` : key
}
