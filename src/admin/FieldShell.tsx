import { FieldDescription, FieldError, FieldLabel } from '@payloadcms/ui'
import React from 'react'

import type { useTextFieldProps } from './useTextFieldProps.js'

type InputProps = ReturnType<typeof useTextFieldProps>['inputProps']

/**
 * The frame of a Payload field (`@payloadcms/ui` `fields/Number`): `.field-type` with the row
 * width style, the label, then `.field-type__wrap` with the error, BeforeInput, the input,
 * AfterInput and the description. The field's own custom slots win over the defaults.
 */
export function FieldShell({
  children,
  className,
  inputProps,
}: {
  children: React.ReactNode
  className: string
  inputProps: InputProps
}) {
  const { AfterInput, BeforeInput, Description, description, Error, Label, label, localized, path, readOnly, required, showError, style } =
    inputProps
  return (
    <div
      className={['field-type', className, inputProps.className, showError && 'error', readOnly && 'read-only'].filter(Boolean).join(' ')}
      style={style}
    >
      {Label ?? <FieldLabel label={label} localized={localized} path={path} required={required} />}
      <div className="field-type__wrap">
        {Error ?? <FieldError path={path} showError={showError} />}
        {BeforeInput}
        {children}
        {AfterInput}
        {Description ?? <FieldDescription description={description} path={path} />}
      </div>
    </div>
  )
}
