import type { Answers, FormLike, FormSection, FormWords } from './types.js'

import {
  evaluateRules,
  getInputFields,
  getSectionKey,
  getVisibleSections,
  isSectionVisible,
  normalizeKey,
} from './rules.js'
import { interpolate } from './tokens.js'
import { DEFAULT_WORDS } from './words.js'

function nextFrom(
  form: FormLike,
  visible: FormSection[],
  index: number,
  answers: Answers,
): number {
  const section = visible[index]
  for (const rule of (section.nextStepRules || []).filter(Boolean)) {
    if (!evaluateRules(rule, answers, form)) {
      continue
    }
    const target = normalizeKey(rule.targetSectionKey)
    const targetIndex = visible.findIndex((s) => getSectionKey(s) === target)
    if (target && targetIndex !== -1) {
      return targetIndex
    }
  }
  return index + 1
}

/**
 * The sections a visitor goes through. Step-by-step forms start at the first visible section;
 * from each section the first matching next-step rule that targets a visible section wins, else
 * the next visible section. Single-page forms: every visible section.
 */
export function getStepPath(form: FormLike, answers: Answers): string[] {
  const visible = getVisibleSections(form, answers)
  if (form.presentationMode !== 'steps') {
    return visible.map(getSectionKey)
  }
  const path: string[] = []
  const seen = new Set<number>()
  let index = 0
  while (index < visible.length && !seen.has(index)) {
    seen.add(index)
    path.push(getSectionKey(visible[index]))
    index = nextFrom(form, visible, index, answers)
  }
  return path
}

/** The section after `currentKey` on the path, or null at the end. */
export function getNextSectionKey(form: FormLike, currentKey: string, answers: Answers): null | string {
  const visible = getVisibleSections(form, answers)
  const index = visible.findIndex((s) => getSectionKey(s) === normalizeKey(currentKey))
  if (index === -1) {
    return visible[0] ? getSectionKey(visible[0]) : null
  }
  const next = nextFrom(form, visible, index, answers)
  return visible[next] ? getSectionKey(visible[next]) : null
}

/** Where a visitor is on the path: `current` of `total`, and the form's step progress words. */
export function getStepProgress(
  form: FormLike,
  answers: Answers,
  currentKey: string,
  words?: Partial<FormWords>,
): { current: number; text: string; total: number } {
  const path = getStepPath(form, answers)
  const current = path.indexOf(normalizeKey(currentKey)) + 1
  const total = path.length
  const template = words?.stepProgress || form.wording?.stepProgress || DEFAULT_WORDS.stepProgress
  return { current, text: interpolate(template, { current, total }), total }
}

export type Visibility = {
  /** Answers of the shown fields only. */
  answers: Answers
  /** Keys of the inputs that are shown (and, in steps, on the path). */
  fieldKeys: Set<string>
  /** Keys of the sections that count: visible ones, or in steps the ones on the path. */
  sectionKeys: string[]
}

/**
 * What is shown for these answers. Hidden answers are dropped and the rules are read again until
 * nothing changes, so an answer left in a hidden field never decides what else is shown.
 */
export function getVisibility(form: FormLike, answers: Answers): Visibility {
  const inputs = getInputFields(form)
  let current: Answers = answers
  let result: Visibility = { answers: {}, fieldKeys: new Set(), sectionKeys: [] }
  for (let round = 0; round < 10; round += 1) {
    const sectionKeys = getStepPath(form, current)
    const active = new Set(sectionKeys)
    const fieldKeys = new Set<string>()
    for (const { field, key, section } of inputs) {
      if (!active.has(getSectionKey(section))) {
        continue
      }
      if (!isSectionVisible(section, current, form)) {
        continue
      }
      if (!evaluateRules(field.visibilityRules, current, form)) {
        continue
      }
      fieldKeys.add(key)
    }
    const next: Answers = {}
    for (const key of fieldKeys) {
      if (key in answers) {
        next[key] = answers[key]!
      }
    }
    const same =
      result.fieldKeys.size === fieldKeys.size && [...fieldKeys].every((k) => result.fieldKeys.has(k))
    result = { answers: next, fieldKeys, sectionKeys }
    if (same && round > 0) {
      break
    }
    current = next
  }
  return result
}
