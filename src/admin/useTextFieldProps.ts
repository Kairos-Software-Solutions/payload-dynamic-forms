import type { TextFieldClientProps } from 'payload'

import { useField } from '@payloadcms/ui'
import { mergeFieldStyles } from '@payloadcms/ui/shared'
import { useCallback, useMemo } from 'react'

/**
 * What Payload's Text field passes to its input (`@payloadcms/ui` `fields/Text`), for the plugin's
 * fields that replace it: the row width style, the field's label, description and error slots,
 * `showError`, read-only, required, localized and the form path.
 */
export function useTextFieldProps(props: TextFieldClientProps) {
  const { field, path: pathFromProps, readOnly, validate } = props
  const { admin: { className, description, placeholder } = {}, label, localized, required } = field
  const memoizedValidate = useCallback(
    (value: unknown, options: Record<string, unknown>) =>
      typeof validate === 'function' ? validate(value as never, { ...options, required } as never) : true,
    [validate, required],
  )
  const fieldState = useField<string>({ potentiallyStalePath: pathFromProps, validate: memoizedValidate as never })
  const { customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {}, disabled, path, showError } = fieldState
  const style = useMemo(() => mergeFieldStyles(field), [field])
  return {
    fieldState,
    inputProps: {
      AfterInput,
      BeforeInput,
      className,
      Description,
      description,
      Error,
      Label,
      label,
      localized,
      path,
      placeholder,
      readOnly: Boolean(readOnly || disabled),
      required,
      showError,
      style,
    },
  }
}
