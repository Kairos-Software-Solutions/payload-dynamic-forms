import type { UIFieldClientComponent } from 'payload'

import { FieldDescription, useFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { sectionIndexOf, type SkippedSection, skippedSectionsWithShowRules } from './formKeys.js'

/** One line per section a jump passes over that has its own show rules. */
export function jumpSkipText({ skipped, target }: SkippedSection): string {
  return `Jump to “${target}” skips “${skipped}”, which has its own show rules. A jump skips every section in between; for an optional section, use its show rules instead of a jump.`
}

/**
 * Under a section's jumps: names each skipped section that has show rules, from the form state
 * (unsaved edits included). Renders nothing when there is none.
 */
export const JumpSkipHint: UIFieldClientComponent = ({ path }) => {
  const own = sectionIndexOf(path)
  const signature = useFormFields(([fields]) =>
    own === undefined ? '' : JSON.stringify(skippedSectionsWithShowRules(fields, own)),
  )
  const lines = useMemo(() => (signature ? (JSON.parse(signature) as SkippedSection[]) : []), [signature])
  if (!lines.length) {
    return null
  }
  return (
    <div className="field-type jump-skip-hint">
      {lines.map((line) => (
        <FieldDescription description={jumpSkipText(line)} key={`${line.target}:${line.skipped}`} path={path} />
      ))}
    </div>
  )
}
