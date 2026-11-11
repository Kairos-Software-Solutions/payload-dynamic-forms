import type { TextFieldClientComponent } from 'payload'

import { TextInput } from '@payloadcms/ui'
import React, { useLayoutEffect, useRef } from 'react'

import { caretAfterFormat, formatKeyInput } from './keys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

/**
 * Question and section key: formats to lower-case kebab-case on every change and keeps the caret
 * after the typed characters. The save hook still normalises (and trims the trailing dash).
 */
export const KeyField: TextFieldClientComponent = (props) => {
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { setValue, value } = fieldState
  const inputRef = useRef<HTMLInputElement>(null)
  const caret = useRef<null | number>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (caret.current !== null && input && input.ownerDocument.activeElement === input) {
      input.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })

  return (
    <TextInput
      {...inputProps}
      inputRef={inputRef as React.RefObject<HTMLInputElement>}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value
        caret.current = caretAfterFormat(raw, event.target.selectionStart ?? raw.length)
        setValue(formatKeyInput(raw))
      }}
      value={value || ''}
    />
  )
}
