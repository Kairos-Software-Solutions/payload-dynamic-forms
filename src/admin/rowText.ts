/**
 * Row label texts for the plugin's lists (no React here, so it is unit-tested on its own). Ported
 * from the site starter's row labels (first non-empty text, cut at 72 characters, else `Row N`),
 * with the 0.5.0 wording per list: sections `key · title`, questions `type · key · label`, rules
 * in words, options `label = value`, jumps `Jump to <section>`.
 */
import { OPERATORS } from '../shared/operators.js'

export const ROW_TEXT_MAX = 72

type Row = null | Record<string, unknown> | undefined

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

/** Cut at 72 characters with `…`. */
export function cutRowText(value: string): string {
  const chars = [...value]
  return chars.length > ROW_TEXT_MAX ? `${chars.slice(0, ROW_TEXT_MAX).join('')}…` : value
}

/** `Row N` for the row at `index` (0-based, as `useRowLabel`'s `rowNumber`). */
export function fallbackRowText(index: number | undefined): string {
  return `Row ${(index ?? 0) + 1}`
}

function joined(parts: unknown[], index: number | undefined): string {
  const own = parts.map(text).filter(Boolean)
  return own.length ? cutRowText(own.join(' · ')) : fallbackRowText(index)
}

/** Any row: the first non-empty of title, label, key, fieldKey, targetSectionKey, value. */
export function formRowText(row: Row, index?: number): string {
  for (const name of ['title', 'label', 'key', 'fieldKey', 'targetSectionKey', 'value']) {
    const value = text(row?.[name])
    if (value) {
      return cutRowText(value)
    }
  }
  return fallbackRowText(index)
}

/** A section: `key · title` (either alone when the other is empty). */
export function sectionRowText(row: Row, index?: number): string {
  return joined([row?.key, row?.title], index)
}

/**
 * A question block: `type · key · label` for inputs, `type · heading` and `type · body` for
 * headings and help texts; empty parts left out. `typeLabel`: the block's singular label.
 */
export function questionRowText(row: Row, index?: number, typeLabel?: string): string {
  const type = text(typeLabel)
  const words = (row?.words && typeof row.words === 'object' ? row.words : {}) as Record<string, unknown>
  const blockType = text(row?.blockType)
  const display = blockType === 'heading' || blockType === 'helpText' || (!text(row?.fieldKey) && (text(row?.heading) || text(row?.body)))
  const own = display ? [row?.heading || row?.body] : [row?.fieldKey, words.label]
  const parts = own.map(text).filter(Boolean)
  if (!parts.length) {
    return type ? cutRowText(`${type} · ${fallbackRowText(index)}`) : fallbackRowText(index)
  }
  return joined([type, ...parts], index)
}

/** A rule: `<field> <operator in lower case> <value>`; no value for "has a value" / "has no value". */
export function ruleRowText(row: Row, index?: number): string {
  const field = text(row?.fieldKey)
  const operator = text(row?.operator)
  const label = OPERATORS.find((o) => o.value === operator)?.label.toLowerCase() || operator
  const value = operator === 'hasValue' || operator === 'notHasValue' ? '' : text(row?.value)
  const words = [field, label, value].filter(Boolean)
  return field ? cutRowText(words.join(' ')) : fallbackRowText(index)
}

/** A typed option: `label = value` (either alone when the other is empty). */
export function optionRowText(row: Row, index?: number): string {
  const label = text(row?.label)
  const value = text(row?.value)
  if (label && value) {
    return cutRowText(`${label} = ${value}`)
  }
  return label || value ? cutRowText(label || value) : fallbackRowText(index)
}

/** A jump: `Jump to <section>`. */
export function jumpRowText(row: Row, index?: number): string {
  const target = text(row?.targetSectionKey)
  return target ? cutRowText(`Jump to ${target}`) : fallbackRowText(index)
}

export type RowKind = 'jump' | 'option' | 'rule' | 'section'

/** The text of an array row of `kind` (none: the generic `formRowText`). */
export function rowText(kind: RowKind | undefined, row: Row, index?: number): string {
  switch (kind) {
    case 'jump':
      return jumpRowText(row, index)
    case 'option':
      return optionRowText(row, index)
    case 'rule':
      return ruleRowText(row, index)
    case 'section':
      return sectionRowText(row, index)
    default:
      return formRowText(row, index)
  }
}
