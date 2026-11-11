/**
 * A small stand-in for `@payloadcms/ui` (design 12): an in-memory form state with the hooks the
 * plugin's admin components use, and plain inputs in place of Payload's. No Payload provider tree.
 * Tests mock `@payloadcms/ui` with `uiMock` and `@payloadcms/ui/shared` with `sharedMock`.
 */
import React, { useSyncExternalStore } from 'react'

type FieldState = { value?: unknown }
type State = Record<string, FieldState>

let fields: State = {}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const form = {
  get: (path: string): unknown => fields[path]?.value,
  /** Replaces the whole form state: `{ path: value }`. */
  reset(values: Record<string, unknown>) {
    fields = Object.fromEntries(Object.entries(values).map(([path, value]) => [path, { value }]))
    emit()
  },
  set(path: string, value: unknown) {
    fields = { ...fields, [path]: { value } }
    emit()
  },
}

const dispatch = (action: { path: string; type: string; value?: unknown }) => {
  if (action.type === 'UPDATE') {
    form.set(action.path, action.value)
  }
}

function useFormFields<T>(selector: (context: [State, typeof dispatch]) => T): T {
  return useSyncExternalStore(subscribe, () => selector([fields, dispatch]))
}

function useField<T>({ path, potentiallyStalePath }: { path?: string; potentiallyStalePath?: string }) {
  const resolved = path || potentiallyStalePath || ''
  const value = useSyncExternalStore(subscribe, () => fields[resolved]?.value) as T
  return {
    customComponents: {},
    disabled: false,
    path: resolved,
    setValue: (next: unknown) => form.set(resolved, next),
    showError: false,
    value,
  }
}

type InputProps = {
  AfterInput?: React.ReactNode
  inputRef?: React.RefObject<HTMLInputElement>
  label?: unknown
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  path: string
  readOnly?: boolean
  style?: React.CSSProperties
  value?: string
}

function TextInput({ AfterInput, inputRef, label, onChange, path, readOnly, style, value }: InputProps) {
  return (
    <div data-path={path} style={style}>
      <input aria-label={typeof label === 'string' ? label : path} onChange={onChange} readOnly={readOnly} ref={inputRef} value={value ?? ''} />
      {AfterInput}
    </div>
  )
}

type SelectProps = {
  label?: unknown
  name: string
  onChange?: (option: unknown) => void
  options?: { label: string; value: string }[]
  path: string
  style?: React.CSSProperties
  value?: string
}

function SelectInput({ label, onChange, options = [], path, style, value }: SelectProps) {
  return (
    <div data-path={path} style={style}>
      <select
        aria-label={typeof label === 'string' ? label : path}
        onChange={(e) => onChange?.(options.find((o) => o.value === e.target.value) ?? null)}
        value={value ?? ''}
      >
        <option value="">(none)</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Button({ children, onClick }: { children?: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} type="button">
      {children}
    </button>
  )
}

function FieldDescription({ description }: { description?: unknown; path: string }) {
  return <p>{typeof description === 'string' ? description : ''}</p>
}

export const uiMock = { Button, FieldDescription, SelectInput, TextInput, useField, useFormFields }

export const sharedMock = {
  mergeFieldStyles: (field: { admin?: { width?: string } }) => (field.admin?.width ? { '--field-width': field.admin.width } : {}),
}

/** The option texts of a select, without the empty first one. */
export function optionTexts(select: HTMLSelectElement): string[] {
  return [...select.options].filter((o) => o.value !== '').map((o) => o.textContent || '')
}
