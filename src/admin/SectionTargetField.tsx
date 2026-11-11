import type { OptionObject, TextFieldClientComponent } from 'payload'

import { SelectInput, useFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { normalizeKey } from '../shared/rules.js'
import { sectionIndexOf, sectionKeyOptions } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

/**
 * A next-step rule's target: a pick-list of the other sections' keys (its own section would be a
 * loop). Stores the key as text. A stored key the form no longer has stays listed and selected.
 */
export const SectionTargetField: TextFieldClientComponent = (props) => {
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { path, setValue, value } = fieldState
  const own = sectionIndexOf(path)
  const signature = useFormFields(([fields]) => sectionKeyOptions(fields, own).join('\n'))
  const keys = useMemo(() => (signature ? signature.split('\n') : []), [signature])
  const current = normalizeKey(value)
  const options: OptionObject[] = keys.map((key) => ({ label: key, value: key }))
  if (current && !keys.includes(current)) {
    options.push({ label: `${current} (not in this form)`, value: current })
  }
  const { placeholder, ...rest } = inputProps
  return (
    <SelectInput
      {...rest}
      isClearable={false}
      name={props.field.name}
      onChange={(option) => setValue(String((option as null | OptionObject)?.value ?? ''))}
      options={options}
      placeholder={typeof placeholder === 'string' ? placeholder : undefined}
      value={current}
    />
  )
}
