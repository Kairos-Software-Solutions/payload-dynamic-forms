import { useRowLabel } from '@payloadcms/ui'
import React from 'react'

import { questionRowText, type RowKind, rowText } from './rowText.js'

type RowData = Record<string, unknown>

/**
 * An array row's label (`admin.components.RowLabel`), from the row's own values: `clientProps.kind`
 * picks the wording (`section`, `rule`, `option`, `jump`; none: the first non-empty text).
 */
export const RowLabel: React.FC<{ kind?: RowKind }> = ({ kind }) => {
  const { data, rowNumber } = useRowLabel<RowData>()
  return <span className="payload-dynamic-forms-row-label">{rowText(kind, data, rowNumber)}</span>
}

/**
 * A question block's label (the block's `admin.components.Label`, which replaces the whole row
 * header): `type · key · label`, with `clientProps.typeLabel` the block's singular label.
 */
export const QuestionLabel: React.FC<{ typeLabel?: string }> = ({ typeLabel }) => {
  const { data, rowNumber } = useRowLabel<RowData>()
  return <span className="payload-dynamic-forms-row-label">{questionRowText(data, rowNumber, typeLabel)}</span>
}
