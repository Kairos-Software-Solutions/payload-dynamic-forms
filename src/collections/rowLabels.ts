/**
 * Row label components (client entry, by path only): `RowLabel` on array rows with the wording
 * `kind`, `QuestionLabel` as each question block's own label with its type's name.
 */
const CLIENT = 'payload-dynamic-forms/client'

export type RowLabelKind = 'jump' | 'option' | 'rule' | 'section'

/** The generic row label (first non-empty text): emails, webhooks, headers. */
export const ROW_LABEL = `${CLIENT}#RowLabel`

export function rowLabel(kind: RowLabelKind) {
  return { clientProps: { kind }, path: `${CLIENT}#RowLabel` }
}

export function questionLabel(typeLabel: string) {
  return { clientProps: { typeLabel }, path: `${CLIENT}#QuestionLabel` }
}
