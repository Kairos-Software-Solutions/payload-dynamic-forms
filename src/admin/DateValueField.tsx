import type { TextFieldClientProps } from 'payload'

import { DatePicker, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { dateMode, TODAY } from '../shared/dates.js'
import { PICKER_PROPS, pickToText, relativeWord, textToPick } from './dateText.js'
import { FieldShell } from './FieldShell.js'
import { siblingPath } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

export type DateValueFieldProps = {
  /** Earliest or Latest (`clientProps.limit`): a Time question's limits get no "Now". */
  limit?: boolean
} & TextFieldClientProps

/**
 * A date question's default, Earliest or Latest: Payload's `DatePicker` in the question's mode
 * (the sibling `mode`; empty is Date) with the year and a 24-hour clock, plus a "Today" (Date) or
 * "Now" (Date and time, Time) choice that stores `today`. Stores wall-time text (`dateText.ts`).
 */
export const DateValueField: React.FC<DateValueFieldProps> = (props) => {
  const { limit } = props
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { path, setValue, value } = fieldState
  const mode = dateMode({ mode: useFormFields(([fields]) => fields[siblingPath(path, 'mode')]?.value) as never })
  const offersRelative = !(limit && mode === 'timeOnly')
  const relative = value === TODAY
  const word = relativeWord(mode)
  return (
    <FieldShell className="date-time-field date-value-field" inputProps={inputProps}>
      <div className="date-value-field__input" id={`field-${path.replace(/\./g, '__')}`}>
        <DatePicker
          {...PICKER_PROPS[mode]}
          onChange={(date: Date | null) => setValue(date ? pickToText(date, mode) || null : null)}
          placeholder={relative ? word : undefined}
          readOnly={inputProps.readOnly || relative}
          value={relative ? undefined : textToPick(value, mode)}
        />
      </div>
      {offersRelative ? (
        <label className="date-value-field__relative" style={{ alignItems: 'center', display: 'inline-flex', gap: 'calc(var(--base) / 4)', marginTop: 'calc(var(--base) / 4)' }}>
          <input
            aria-label={word}
            checked={relative}
            disabled={inputProps.readOnly}
            onChange={(event) => setValue(event.target.checked ? TODAY : null)}
            type="checkbox"
          />
          {word}
        </label>
      ) : null}
    </FieldShell>
  )
}