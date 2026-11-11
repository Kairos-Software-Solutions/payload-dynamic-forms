import type { UIFieldClientComponent } from 'payload'

import { FieldDescription } from '@payloadcms/ui'
import React from 'react'

export const NO_ANSWER_HINT =
  "Optional question: once visitors pick an answer they can't clear it. If no answer is valid, add a choice such as “None of the above” or “Not sure”."

/** Shown under an optional radio question's choices (the field's condition hides it when required). */
export const NoAnswerHint: UIFieldClientComponent = ({ path }) => (
  <div className="field-type no-answer-hint">
    <FieldDescription description={NO_ANSWER_HINT} path={path} />
  </div>
)
