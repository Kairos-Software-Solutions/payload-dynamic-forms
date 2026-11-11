/**
 * Key formatting while the editor types (no React here, so it is unit-tested on its own).
 * The result is lower-case kebab-case like `normalizeKey`, except that one trailing dash is kept,
 * so `project ` can go on to `project-type`. The save hook's `normalizeKey` stays the guarantee.
 */
export function formatKeyInput(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
}

/**
 * Where the caret goes after formatting: after the formatted form of the characters that were
 * before it. `Project Type` with the caret after `Project T` gives the offset after `project-t`.
 */
export function caretAfterFormat(raw: string, caret: number): number {
  const text = String(raw ?? '')
  const at = Math.max(0, Math.min(caret, text.length))
  return Math.min(formatKeyInput(text.slice(0, at)).length, formatKeyInput(text).length)
}
