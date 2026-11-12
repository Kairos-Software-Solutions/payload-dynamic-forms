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
  description?: unknown
  inputRef?: React.RefObject<HTMLInputElement>
  label?: unknown
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  path: string
  readOnly?: boolean
  style?: React.CSSProperties
  value?: string
}

/**
 * The element tree of `@payloadcms/ui@3.92.1` `fields/Text/Input`: the field (`.field-type.text`,
 * relative per its scss) holds the label and `.field-type__wrap` (relative per
 * `forms/RenderFields/index.scss`), which holds the input, `AfterInput` and then the description.
 * The inline positions stand in for those stylesheets, which jsdom doesn't load.
 */
function TextInput({ AfterInput, description, inputRef, label, onChange, path, readOnly, style, value }: InputProps) {
  return (
    <div className="field-type text" data-path={path} style={{ ...style, position: 'relative' }}>
      <span>{typeof label === 'string' ? label : ''}</span>
      <div className="field-type__wrap" style={{ position: 'relative' }}>
        <input aria-label={typeof label === 'string' ? label : path} onChange={onChange} readOnly={readOnly} ref={inputRef} value={value ?? ''} />
        {AfterInput}
        {typeof description === 'string' ? <p className="field-description">{description}</p> : null}
      </div>
    </div>
  )
}

type SelectProps = {
  hasMany?: boolean
  label?: unknown
  name: string
  onChange?: (option: unknown) => void
  options?: { label: string; value: string }[]
  path: string
  style?: React.CSSProperties
  value?: string | string[]
}

/** A plain `<select>`; with `hasMany` a multiple select whose change hands over the picked options. */
function SelectInput({ hasMany, label, onChange, options = [], path, style, value }: SelectProps) {
  if (hasMany) {
    return (
      <div data-path={path} style={style}>
        <select
          aria-label={typeof label === 'string' ? label : path}
          multiple
          onChange={(e) => onChange?.([...e.target.selectedOptions].map((s) => options.find((o) => o.value === s.value)).filter(Boolean))}
          value={Array.isArray(value) ? value : value ? [value] : []}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <div data-path={path} style={style}>
      <select
        aria-label={typeof label === 'string' ? label : path}
        onChange={(e) => onChange?.(options.find((o) => o.value === e.target.value) ?? null)}
        value={typeof value === 'string' ? value : ''}
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

function FieldLabel({ label }: { label?: unknown; path?: string }) {
  return <span className="field-label">{typeof label === 'string' ? label : ''}</span>
}

function FieldError({ showError }: { path?: string; showError?: boolean }) {
  return showError ? <span className="field-error" /> : null
}

/** The props the last-rendered mocked `DatePicker` got, by `aria-label` order (tests read them). */
export const datePickers: Record<string, unknown>[] = []

/**
 * `@payloadcms/ui`'s `DatePicker` as a plain input: typing an ISO date-time calls `onChange` with
 * that `Date` (what the real picker hands over is the caller's to build); clearing calls it with
 * null. The props are kept in `datePickers` for the test to read.
 */
function DatePicker(props: { onChange?: (date: Date | null) => void; placeholder?: string; readOnly?: boolean; value?: Date | string }) {
  datePickers.push(props)
  const { onChange, placeholder, readOnly, value } = props
  return (
    <input
      aria-label="date picker"
      data-appearance={(props as { pickerAppearance?: string }).pickerAppearance}
      onChange={(e) => onChange?.(e.target.value ? new Date(e.target.value) : null)}
      placeholder={placeholder}
      readOnly={readOnly}
      value={value instanceof Date ? value.toISOString() : (value ?? '')}
    />
  )
}

export const config = { routes: { api: '/api' }, serverURL: 'https://cms.example.com' }

function configHook() {
  return { config }
}

/** The row `useRowLabel` returns; tests set it before rendering a label. */
export const rowLabel: { data: unknown; path: string; rowNumber?: number } = { data: {}, path: '', rowNumber: 0 }

function rowLabelHook() {
  return rowLabel
}

export const uiMock = {
  Button,
  DatePicker,
  FieldDescription,
  FieldError,
  FieldLabel,
  SelectInput,
  TextInput,
  useConfig: configHook,
  useField,
  useFormFields,
  useRowLabel: rowLabelHook,
}

export const sharedMock = {
  mergeFieldStyles: (field: { admin?: { width?: string } }) => (field.admin?.width ? { '--field-width': field.admin.width } : {}),
}

/** The option texts of a select, without the empty first one. */
export function optionTexts(select: HTMLSelectElement): string[] {
  return [...select.options].filter((o) => o.value !== '').map((o) => o.textContent || '')
}