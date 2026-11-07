import type {
  AnswerValue,
  Answers,
  ChoiceOption,
  FieldBlock,
  FormLike,
  FormSection,
  InputBlock,
  RuleGroup,
  RuleRow,
} from './types.js'

/** Lower-case kebab-case: ` Project Type ` → `project-type`. */
export function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Splits a rule key into the field key and an optional option attribute:
 * `Need.fieldSet` → `{ key: 'need', attribute: 'fieldSet' }`. The attribute keeps its case.
 */
export function splitRuleKey(value: unknown): { attribute?: string; key: string } {
  if (typeof value !== 'string') {
    return { key: '' }
  }
  const trimmed = value.trim()
  const dot = trimmed.indexOf('.')
  if (dot === -1) {
    return { key: normalizeKey(trimmed) }
  }
  const attribute = trimmed.slice(dot + 1).trim()
  return { attribute: attribute || undefined, key: normalizeKey(trimmed.slice(0, dot)) }
}

export const DISPLAY_BLOCK_TYPES: readonly string[] = ['heading', 'helpText']
export const CHOICE_BLOCK_TYPES: readonly string[] = ['select', 'radio', 'checkboxGroup']

export function isInputBlock(block: FieldBlock | null | undefined): block is InputBlock {
  return Boolean(block?.blockType) && !DISPLAY_BLOCK_TYPES.includes(block!.blockType)
}

export function isChoiceBlock(block: FieldBlock | null | undefined): boolean {
  return Boolean(block?.blockType) && CHOICE_BLOCK_TYPES.includes(block!.blockType)
}

export function getFieldKey(block: FieldBlock | null | undefined): string {
  return isInputBlock(block) ? normalizeKey(block.fieldKey) : ''
}

export function getSectionKey(section: FormSection | null | undefined): string {
  return normalizeKey(section?.key)
}

export function getSections(form: FormLike): FormSection[] {
  return (form.sections || []).filter(Boolean)
}

export type InputEntry = { field: InputBlock; key: string; section: FormSection }

/** Every input of the form in order, with its normalised key. */
export function getInputFields(form: FormLike): InputEntry[] {
  return getSections(form).flatMap((section) =>
    (section.fields || [])
      .filter(isInputBlock)
      .map((field) => ({ field, key: getFieldKey(field), section }))
      .filter((entry) => entry.key),
  )
}

export function getInputFieldMap(form: FormLike): Map<string, InputEntry> {
  const map = new Map<string, InputEntry>()
  for (const entry of getInputFields(form)) {
    if (!map.has(entry.key)) {
      map.set(entry.key, entry)
    }
  }
  return map
}

export function getFieldLabel(field: InputBlock, key = getFieldKey(field)): string {
  return field.words?.label?.trim() || key
}

export function getRowLabel(field: InputBlock, key = getFieldKey(field)): string {
  return field.words?.rowLabel?.trim() || getFieldLabel(field, key)
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim().length === 0
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (Array.isArray(v.filenames)) {
      return v.filenames.length === 0
    }
    return Object.keys(v).length === 0
  }
  return false
}

/** True when an answer counts as given: `false` and empty strings, lists and objects don't. */
export function hasAnswer(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return !isBlank(value)
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (value === null || value === undefined || value === false) {
    return []
  }
  return [String(value).trim()].filter(Boolean)
}

function asText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '')).join(', ')
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

function compareNumberOrDate(left: unknown, right: unknown): null | number {
  const l = typeof left === 'number' ? left : Number(String(left ?? '').trim())
  const r = typeof right === 'number' ? right : Number(String(right ?? '').trim())
  const leftText = String(left ?? '').trim()
  const rightText = String(right ?? '').trim()
  if (leftText && rightText && Number.isFinite(l) && Number.isFinite(r)) {
    return l - r
  }
  const ld = Date.parse(leftText)
  const rd = Date.parse(rightText)
  if (!Number.isNaN(ld) && !Number.isNaN(rd)) {
    return ld - rd
  }
  return null
}

/** The options a choice field offers (typed, or resolved from a source by the server). */
export function getOptions(field: InputBlock | undefined): ChoiceOption[] {
  return (field?.options || []).filter((o): o is ChoiceOption => Boolean(o && o.value != null))
}

/**
 * The value a rule row reads: the answer, or for `<key>.<attribute>` the attribute of the
 * chosen option(s) of that field.
 */
export function readRuleValue(ruleKey: unknown, answers: Answers, form?: FormLike): unknown {
  const { attribute, key } = splitRuleKey(ruleKey)
  if (!key) {
    return undefined
  }
  const answer = answers[key]
  if (!attribute) {
    return answer
  }
  if (!form) {
    return undefined
  }
  const entry = getInputFieldMap(form).get(key)
  const options = getOptions(entry?.field)
  const chosen = toStringList(answer)
  const values = chosen
    .map((value) => options.find((o) => String(o.value) === value)?.attributes?.[attribute])
    .filter((v) => v !== undefined && v !== null)
  if (Array.isArray(answer)) {
    return values.map((v) => String(v))
  }
  return values[0]
}

export function evaluateRow(row: null | RuleRow | undefined, answers: Answers, form?: FormLike): boolean {
  const operator = row?.operator
  if (!row || !operator || !splitRuleKey(row.fieldKey).key) {
    return true
  }
  const answer = readRuleValue(row.fieldKey, answers, form)
  const expected = String(row.value ?? '').trim()

  switch (operator) {
    case 'contains':
      return asText(answer).toLowerCase().includes(expected.toLowerCase())
    case 'equals':
      return asText(answer).trim() === expected
    case 'greaterThan': {
      const c = compareNumberOrDate(answer, expected)
      return c !== null && c > 0
    }
    case 'hasValue':
      return hasAnswer(answer)
    case 'includesOption': {
      const haystack = toStringList(answer)
      return toStringList(expected).some((needle) => haystack.includes(needle))
    }
    case 'lessThan': {
      const c = compareNumberOrDate(answer, expected)
      return c !== null && c < 0
    }
    case 'notContains':
      return !asText(answer).toLowerCase().includes(expected.toLowerCase())
    case 'notEquals':
      return asText(answer).trim() !== expected
    case 'notHasValue':
      return !hasAnswer(answer)
    default:
      return true
  }
}

/** A group matches when all rows match (`all`, default) or any row does (`any`); empty matches. */
export function evaluateRules(
  group: null | RuleGroup | undefined,
  answers: Answers,
  form?: FormLike,
): boolean {
  const rows = (group?.rows || []).filter(Boolean)
  if (!rows.length) {
    return true
  }
  if (group?.match === 'any') {
    return rows.some((row) => evaluateRow(row, answers, form))
  }
  return rows.every((row) => evaluateRow(row, answers, form))
}

export function isSectionVisible(section: FormSection, answers: Answers, form?: FormLike): boolean {
  return evaluateRules(section.visibilityRules, answers, form)
}

/** A field is shown when its section is shown and its own rules match. */
export function isFieldVisible(
  section: FormSection,
  field: FieldBlock,
  answers: Answers,
  form?: FormLike,
): boolean {
  if (!isSectionVisible(section, answers, form)) {
    return false
  }
  if (!isInputBlock(field)) {
    return true
  }
  return evaluateRules(field.visibilityRules, answers, form)
}

export function getVisibleSections(form: FormLike, answers: Answers): FormSection[] {
  return getSections(form).filter((section) => isSectionVisible(section, answers, form))
}

type SearchParamsLike =
  | Record<string, string | string[] | undefined>
  | string
  | URLSearchParams
  | { get(name: string): null | string; getAll?(name: string): string[] }

function readParam(params: SearchParamsLike | undefined, name: string): string[] {
  if (!params || !name) {
    return []
  }
  if (typeof params === 'string') {
    return new URLSearchParams(params).getAll(name)
  }
  if (typeof (params as URLSearchParams).get === 'function') {
    const p = params as URLSearchParams
    if (typeof p.getAll === 'function') {
      return p.getAll(name)
    }
    const v = p.get(name)
    return v === null ? [] : [v]
  }
  const v = (params as Record<string, string | string[] | undefined>)[name]
  if (v === undefined) {
    return []
  }
  return Array.isArray(v) ? v : [v]
}

/** The starting answer of a field from its default value. */
export function defaultAnswer(field: InputBlock): AnswerValue {
  const d = field.defaultValue
  if (field.blockType === 'checkbox') {
    return d === true || ['1', 'on', 'true', 'yes'].includes(String(d ?? '').toLowerCase())
  }
  if (field.blockType === 'checkboxGroup') {
    return toStringList(d)
  }
  if (field.blockType === 'fileUpload') {
    return ''
  }
  if (d === null || d === undefined) {
    return ''
  }
  if (typeof d === 'number' || typeof d === 'boolean') {
    return d
  }
  return String(d)
}

/**
 * Starting answers for a renderer: each input's default, or the value of its link parameter
 * when the app passes the page's search parameters. Choice fields take the parameter only when
 * it is one of their options.
 */
export function initialAnswers(form: FormLike, searchParams?: SearchParamsLike): Answers {
  const answers: Answers = {}
  for (const { field, key } of getInputFields(form)) {
    answers[key] = defaultAnswer(field)
    const param = field.prefillParam?.trim()
    if (!param || field.blockType === 'fileUpload') {
      continue
    }
    const raw = readParam(searchParams, param)
      .flatMap((v) => (field.blockType === 'checkboxGroup' ? toStringList(v) : [v.trim()]))
      .filter(Boolean)
    if (!raw.length) {
      continue
    }
    if (isChoiceBlock(field)) {
      const listed = new Set(getOptions(field).map((o) => String(o.value)))
      const ok = raw.filter((v) => listed.has(v))
      if (!ok.length) {
        continue
      }
      answers[key] = field.blockType === 'checkboxGroup' ? ok : ok[0]!
      continue
    }
    if (field.blockType === 'checkbox') {
      answers[key] = ['1', 'on', 'true', 'yes'].includes(raw[0]!.toLowerCase())
      continue
    }
    if (field.blockType === 'number') {
      const n = Number(raw[0])
      answers[key] = Number.isFinite(n) ? n : raw[0]!
      continue
    }
    answers[key] = raw[0]!
  }
  return answers
}
