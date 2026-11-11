import type { OptionObject, TextFieldClientComponent } from 'payload'

import { SelectInput, TextInput, useFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { normalizeKey } from '../shared/rules.js'
import { type FieldKeyOption, fieldKeyOptions, joinRuleKey, splitStoredRuleKey } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

/**
 * A rule's field: a pick-list of the form's input keys (unsaved edits included), plus an optional
 * attribute when the chosen field takes its choices from a collection. Stores `key` or
 * `key.attribute` as text. A stored key the form no longer has stays listed and selected.
 */
export const RuleFieldKeyField: TextFieldClientComponent = (props) => {
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { setValue, value } = fieldState
  // A joined string, so the list re-renders only when the keys change.
  const signature = useFormFields(([fields]) => JSON.stringify(fieldKeyOptions(fields)))
  const keys = useMemo(() => JSON.parse(signature) as FieldKeyOption[], [signature])
  const stored = splitStoredRuleKey(value)
  const current = normalizeKey(stored.key)
  const chosen = keys.find((k) => k.key === current)
  const options: OptionObject[] = keys.map((k) => ({ label: k.key, value: k.key }))
  if (current && !chosen) {
    options.push({ label: `${current} (not in this form)`, value: current })
  }
  const showAttribute = chosen ? chosen.hasAttributes : Boolean(current && stored.attribute)
  const { placeholder, style, ...rest } = inputProps

  return (
    <div className="rule-field-key-field" style={style}>
      <SelectInput
        {...rest}
        isClearable={false}
        name={props.field.name}
        onChange={(option) => {
          const next = String((option as null | OptionObject)?.value ?? '')
          const keepAttribute = keys.find((k) => k.key === next)?.hasAttributes ? stored.attribute : ''
          setValue(joinRuleKey(next, keepAttribute))
        }}
        options={options}
        placeholder={typeof placeholder === 'string' ? placeholder : undefined}
        value={current}
      />
      {showAttribute ? (
        <TextInput
          label="Attribute (optional)"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(joinRuleKey(current, e.target.value))}
          path={`${inputProps.path}__attribute`}
          readOnly={inputProps.readOnly}
          value={stored.attribute}
        />
      ) : null}
    </div>
  )
}
