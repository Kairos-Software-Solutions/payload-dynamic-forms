import type {
  Answers,
  AnswerValue,
  FieldTypeChecks,
  FileLike,
  FormLike,
  FormWords,
  InputBlock,
  SnapshotRow,
  YesNoWords,
} from './types.js'

import { comparableDateValue, type DateContext, dateMode, formatAnswerDate, isValidDateValue, resolveDateLimit, toStoredDateAnswer } from './dates.js'
import {
  getFieldLabel,
  getInputFields,
  getOptions,
  getSectionKey,
  hasAnswer,
  isChoiceBlock,
  toStringList,
} from './rules.js'
import { getVisibility } from './steps.js'
import { interpolate } from './tokens.js'
import { fillWords } from './words.js'

const TRUE_WORDS = ['1', 'on', 'true', 'yes']

/** Default limits for file-upload fields. */
export const DEFAULT_FILE_LIMITS = {
  maxFileSize: 10 * 1024 * 1024,
  maxTotalSize: 25 * 1024 * 1024,
  mimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const

export type FileLimits = {
  maxFileSize?: number
  maxTotalSize?: number
  mimeTypes?: readonly string[]
}

/** One valid address: no spaces, commas or lists, a dot in the domain. */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  return /^[^\s@,;<>()"'[\]\\]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(
    value.trim(),
  )
}

function first(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

/** Turns a raw answer (form data or JSON) into the value the field type keeps. */
export function normalizeAnswer(
  field: InputBlock,
  raw: unknown,
  fieldTypes?: Record<string, FieldTypeChecks>,
): AnswerValue {
  const custom = fieldTypes?.[field.blockType]?.normalize
  if (custom) {
    return custom(raw, field)
  }
  switch (field.blockType) {
    case 'checkbox': {
      const v = first(raw)
      if (typeof v === 'boolean') {
        return v
      }
      return TRUE_WORDS.includes(String(v ?? '').trim().toLowerCase())
    }
    case 'checkboxGroup':
      return toStringList(raw)
    case 'number': {
      const v = first(raw)
      if (typeof v === 'number') {
        return Number.isFinite(v) ? v : String(v)
      }
      const text = String(v ?? '').trim()
      if (!text) {
        return ''
      }
      const n = Number(text)
      return Number.isFinite(n) ? n : text
    }
    default: {
      const v = first(raw)
      if (v === null || v === undefined) {
        return ''
      }
      return typeof v === 'object' ? '' : String(v).trim()
    }
  }
}

/**
 * The text of an answer in messages and snapshots: option labels, file names, the form's
 * `yes` / `no` words for a checkbox (pass `fillWords(form.wording)` or the public form's wording),
 * and date answers as stored or in the question's display style (`dates`: the message's language
 * and the submission's time zone, see `formatAnswerDate`).
 */
export function answerToText(
  field: InputBlock,
  value: AnswerValue,
  words: YesNoWords,
  fieldTypes?: Record<string, FieldTypeChecks>,
  dates?: DateContext,
): string {
  const custom = fieldTypes?.[field.blockType]?.toText
  if (custom) {
    return custom(value, field, words)
  }
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'boolean') {
    return value ? words.yes : words.no
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Array.isArray(value.filenames) ? value.filenames.join(', ') : ''
  }
  if (isChoiceBlock(field)) {
    const options = getOptions(field)
    return toStringList(value)
      .map((v) => options.find((o) => String(o.value) === v)?.label || v)
      .join(', ')
  }
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  if (field.blockType === 'date' && typeof value === 'string') {
    return formatAnswerDate(value, field, dates)
  }
  return String(value)
}

type Problem = 'empty' | 'file' | 'invalid' | null

function checkValue(field: InputBlock, value: AnswerValue, options: CheckOptions): Problem {
  switch (field.blockType) {
    case 'checkboxGroup': {
      const listed = new Set(getOptions(field).map((o) => String(o.value)))
      return toStringList(value).every((v) => listed.has(v)) ? null : 'invalid'
    }
    case 'date': {
      // Per mode (none: Date, as 0.4.0); limits in the same format, seconds ignored, `today`
      // resolved at `now` in the visitor's (else the plugin's) time zone.
      const mode = dateMode(field)
      if (!isValidDateValue(value, mode)) {
        return 'invalid'
      }
      const text = comparableDateValue(value, mode)
      const at = { now: options.now, timeZone: options.timeZone }
      const min = resolveDateLimit(field, 'min', at)
      const max = resolveDateLimit(field, 'max', at)
      if ((min && text < min) || (max && text > max)) {
        return 'invalid'
      }
      return null
    }
    case 'email':
      return isValidEmail(value) ? null : 'invalid'
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'invalid'
      }
      if (typeof field.min === 'number' && value < field.min) {
        return 'invalid'
      }
      if (typeof field.max === 'number' && value > field.max) {
        return 'invalid'
      }
      return null
    }
    case 'radio':
    case 'select': {
      const listed = new Set(getOptions(field).map((o) => String(o.value)))
      return listed.has(String(value)) ? null : 'invalid'
    }
    case 'text':
    case 'textarea': {
      const length = [...String(value)].length
      if (typeof field.minLength === 'number' && field.minLength > 0 && length < field.minLength) {
        return 'invalid'
      }
      if (typeof field.maxLength === 'number' && field.maxLength > 0 && length > field.maxLength) {
        return 'invalid'
      }
      return null
    }
    default:
      return null
  }
}

/** Checks the files given to one upload field: count, MIME type and size. */
export function checkFiles(field: InputBlock, files: FileLike[], limits: FileLimits = {}): boolean {
  const maxFiles = Math.max(1, Number(field.maxFiles) || 1)
  if (files.length > maxFiles) {
    return false
  }
  const pluginTypes = limits.mimeTypes || DEFAULT_FILE_LIMITS.mimeTypes
  const fieldTypes = (field.mimeTypes || []).filter((t) => pluginTypes.includes(t))
  const allowed = fieldTypes.length ? fieldTypes : pluginTypes
  const pluginMax = limits.maxFileSize ?? DEFAULT_FILE_LIMITS.maxFileSize
  const fieldMax = Number(field.maxFileSizeMB) > 0 ? Number(field.maxFileSizeMB) * 1024 * 1024 : pluginMax
  const maxSize = Math.min(fieldMax, pluginMax)
  return files.every(
    (file) => allowed.includes(file.type || 'application/octet-stream') && file.size <= maxSize && file.size > 0,
  )
}

export type CheckOptions = {
  /** Checks for app-registered field types. */
  fieldTypes?: Record<string, FieldTypeChecks>
  /** Files per upload field key. */
  files?: Record<string, FileLike[]>
  limits?: FileLimits
  /** The moment `today` date limits resolve at. Default: now. */
  now?: Date
  /** IANA zone `today` date limits resolve in (the visitor's, else the plugin's). Default: the runtime's. */
  timeZone?: string
  /** Form words; default: the form's wording filled from the defaults. */
  words?: FormWords
}

export type CheckResult = {
  /** Shown answers only, normalised. Upload fields are left out (the server adds them). */
  answers: Answers
  fieldErrors: Record<string, string>
  /** Keys of shown upload fields that got files. */
  fileKeys: string[]
  ok: boolean
}

function errorWords(field: InputBlock, key: string, problem: Exclude<Problem, null>, words: FormWords): string {
  const label = getFieldLabel(field, key)
  if (problem === 'empty') {
    return field.words?.errorEmpty?.trim() || interpolate(words.required, { label })
  }
  if (field.words?.errorInvalid?.trim()) {
    return field.words.errorInvalid.trim()
  }
  return interpolate(problem === 'file' ? words.fileRejected : words.invalid, { label })
}

/**
 * Normalises raw answers, drops hidden ones (and, in steps, those of sections off the path), and
 * reports a field error for every shown field that is required and empty or has a bad value.
 */
export function checkAnswers(form: FormLike, raw: Record<string, unknown>, options: CheckOptions = {}): CheckResult {
  const words = options.words || fillWords(form.wording)
  const files = options.files || {}
  const normalized: Answers = {}
  for (const { field, key } of getInputFields(form)) {
    if (field.blockType === 'fileUpload') {
      normalized[key] = (files[key] || []).map((f) => f.name || 'upload')
      continue
    }
    normalized[key] = normalizeAnswer(field, raw[key], options.fieldTypes)
  }
  const visibility = getVisibility(form, normalized)
  const answers: Answers = {}
  const fieldErrors: Record<string, string> = {}
  const fileKeys: string[] = []
  let totalSize = 0
  const maxTotal = options.limits?.maxTotalSize ?? DEFAULT_FILE_LIMITS.maxTotalSize

  for (const { field, key } of getInputFields(form)) {
    if (!visibility.fieldKeys.has(key) || fieldErrors[key]) {
      continue
    }
    if (field.blockType === 'fileUpload') {
      const given = files[key] || []
      if (!given.length) {
        if (field.required) {
          fieldErrors[key] = errorWords(field, key, 'empty', words)
        }
        continue
      }
      fileKeys.push(key)
      totalSize += given.reduce((sum, f) => sum + f.size, 0)
      if (!checkFiles(field, given, options.limits) || totalSize > maxTotal) {
        fieldErrors[key] = errorWords(field, key, 'file', words)
      }
      continue
    }
    const value = normalized[key]!
    answers[key] = value
    const given = hasAnswer(value)
    if (!given) {
      if (field.required) {
        fieldErrors[key] = errorWords(field, key, 'empty', words)
      }
      continue
    }
    const custom = options.fieldTypes?.[field.blockType]?.validate
    if (custom) {
      const result = custom(value, { answers: normalized, field })
      if (result !== true) {
        fieldErrors[key] = typeof result === 'string' && result ? result : errorWords(field, key, 'invalid', words)
        continue
      }
    }
    const problem = checkValue(field, value, options)
    if (problem) {
      fieldErrors[key] = errorWords(field, key, problem, words)
    }
  }
  return { answers, fieldErrors, fileKeys, ok: Object.keys(fieldErrors).length === 0 }
}

/**
 * The value to store for each answer: Date and time answers of questions stored as `utc` become
 * their UTC instant in `timeZone`; every other answer stays as sent (a new object).
 */
export function toStoredAnswers(form: FormLike, answers: Answers, timeZone: string): Answers {
  const out: Answers = { ...answers }
  for (const { field, key } of getInputFields(form)) {
    if (field.blockType === 'date' && key in out) {
      out[key] = toStoredDateAnswer(field, out[key], timeZone)
    }
  }
  return out
}

/** Section title, label and value per answered, shown field, as worded now (`dates`: see `answerToText`). */
export function buildSnapshot(
  form: FormLike,
  answers: Answers,
  fieldTypes?: Record<string, FieldTypeChecks>,
  dates?: DateContext,
): SnapshotRow[] {
  const words = fillWords(form.wording)
  const rows: SnapshotRow[] = []
  for (const { field, key, section } of getInputFields(form)) {
    if (!(key in answers) || !hasAnswer(answers[key])) {
      continue
    }
    rows.push({
      fieldKey: key,
      label: getFieldLabel(field, key),
      sectionKey: getSectionKey(section),
      sectionTitle: section.title?.trim() || getSectionKey(section),
      value: answerToText(field, answers[key], words, fieldTypes, dates),
    })
  }
  return rows
}