import type { TextFieldClientComponent } from 'payload'

import { Button, TextInput, useField, useFormFields } from '@payloadcms/ui'
import React, { useEffect } from 'react'

import { normalizeKey } from '../shared/rules.js'
import { siblingPath } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

const ACTIONS_STYLE: React.CSSProperties = {
  alignItems: 'center',
  bottom: 0,
  display: 'flex',
  gap: 'calc(var(--base) / 2)',
  insetInlineEnd: 'calc(var(--base) / 2)',
  position: 'absolute',
  top: 0,
}

/**
 * Link parameter with a lock, like Payload's slug field. Locked (`prefillFromKey === true`) it
 * shows the question key read-only and follows it; unlocked (false, or null on a question saved
 * before 0.4.0) it keeps the editor's text. The lock is the stored hidden checkbox, so it survives
 * a reload. File uploads are never prefilled, so they get no lock.
 */
export const PrefillParamField: TextFieldClientComponent = (props) => {
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { path, setValue, value } = fieldState
  const lockPath = siblingPath(path, 'prefillFromKey')
  const keyPath = siblingPath(path, 'fieldKey')
  const typePath = siblingPath(path, 'blockType')
  const locked = useFormFields(([fields]) => fields[lockPath]?.value === true)
  const key = useFormFields(([fields]) => normalizeKey(fields[keyPath]?.value))
  const blockType = useFormFields(([fields]) => fields[typePath]?.value)
  const lock = useField<boolean | null>({ path: lockPath })
  const isUpload = blockType === 'fileUpload'
  const showLocked = locked && !isUpload

  // Locked: the parameter follows the key on screen (the save hook does the same on the server).
  useEffect(() => {
    if (showLocked && (value || '') !== key) {
      setValue(key, true)
    }
  }, [showLocked, key, value, setValue])

  if (isUpload) {
    return <TextInput {...inputProps} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} value={value || ''} />
  }

  const toggle = (event: React.MouseEvent) => {
    event.preventDefault()
    if (showLocked) {
      lock.setValue(false)
    } else {
      lock.setValue(true)
      setValue(key)
    }
  }

  return (
    <TextInput
      {...inputProps}
      AfterInput={
        inputProps.readOnly ? (
          inputProps.AfterInput
        ) : (
          <div className="prefill-param-field__actions" style={ACTIONS_STYLE}>
            <Button buttonStyle="none" className="lock-button" id={`field-${path}-lock`} onClick={toggle}>
              {showLocked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
        )
      }
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      readOnly={inputProps.readOnly || showLocked}
      value={showLocked ? key : value || ''}
    />
  )
}
