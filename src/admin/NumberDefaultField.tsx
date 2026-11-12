import type { TextFieldClientComponent } from 'payload'

import { useFormFields } from '@payloadcms/ui'
import React from 'react'

import { FieldShell } from './FieldShell.js'
import { siblingPath } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A number question's default: a number input inside the question's Min and Max (read from the
 * form state, unsaved edits included). Stored as text (design 2), so no column changes type; an
 * empty input stores no default. The save check still refuses a value outside Min/Max.
 */
export const NumberDefaultField: TextFieldClientComponent = (props) => {
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { path, setValue, value } = fieldState
  const min = finite(useFormFields(([fields]) => fields[siblingPath(path, 'min')]?.value))
  const max = finite(useFormFields(([fields]) => fields[siblingPath(path, 'max')]?.value))
  const text = value === null || value === undefined ? '' : String(value)
  return (
    <FieldShell className="number number-default-field" inputProps={inputProps}>
      <div>
        <input
          aria-label={typeof inputProps.label === 'string' ? inputProps.label : path}
          disabled={inputProps.readOnly}
          id={`field-${path.replace(/\./g, '__')}`}
          max={max}
          min={min}
          name={path}
          onChange={(event) => {
            const next = event.target.value.trim()
            setValue(next === '' ? null : next)
          }}
          onWheel={(event) => (event.target as HTMLInputElement).blur()}
          step="any"
          type="number"
          value={text}
        />
      </div>
    </FieldShell>
  )
}
