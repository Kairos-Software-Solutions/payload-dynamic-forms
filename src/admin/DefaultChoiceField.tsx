import type { OptionObject, TextFieldClientProps } from 'payload'

import { SelectInput, useConfig, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useMemo, useState } from 'react'

import { toStringList } from '../shared/rules.js'
import { siblingPath } from './formKeys.js'
import { useTextFieldProps } from './useTextFieldProps.js'

/** An option source as the field's client props carry it (the plugin's `optionSources`). */
export type ClientOptionSource = { collection: string; labelField: string; valueField: string }

export type DefaultChoiceFieldProps = {
  /** Checkbox group: several values, stored joined by `,`. */
  multiple?: boolean
  sources?: Record<string, ClientOptionSource>
} & TextFieldClientProps

type Choice = { label: string; value: string }

/** Text of an id or a label/value field; anything else is empty. */
function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** The question's typed options from the form state, in order: `<base>options.<i>.value`/`.label`. */
export function typedChoices(fields: Record<string, { value?: unknown } | undefined>, base: string): Choice[] {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}options\\.(\\d+)\\.value$`)
  const found: { i: number; label: string; value: string }[] = []
  for (const path of Object.keys(fields)) {
    const match = pattern.exec(path)
    if (!match) {
      continue
    }
    const value = fields[path]?.value
    if (typeof value !== 'string' || !value.trim()) {
      continue
    }
    const label = fields[`${base}options.${match[1]}.label`]?.value
    found.push({ i: Number(match[1]), label: typeof label === 'string' ? label : '', value: value.trim() })
  }
  return found.sort((a, b) => a.i - b.i).map(({ label, value }) => ({ label, value }))
}

/** The ids of the picked source items, as the relationship field holds them. */
export function pickedIds(value: unknown, collection: string): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      if (item && typeof item === 'object') {
        const { relationTo, value: inner } = item as { relationTo?: string; value?: unknown }
        if (relationTo && relationTo !== collection) {
          return ''
        }
        return asText(inner && typeof inner === 'object' ? (inner as { id?: unknown }).id : (inner ?? (item as { id?: unknown }).id))
      }
      return asText(item)
    })
    .filter(Boolean)
}

/** The REST URL that reads the picked items (or the first 100 when none is picked), drafts included. */
export function sourceItemsURL(base: string, collection: string, ids: string[]): string {
  const where = ids.length ? `where[id][in]=${ids.map(encodeURIComponent).join(',')}&` : ''
  return `${base}/${collection}?${where}depth=0&draft=true&limit=${ids.length ? Math.max(ids.length, 1) : 100}`
}

function useSourceChoices(source: ClientOptionSource | undefined, ids: string[]): Choice[] {
  const { config } = useConfig()
  const api = `${config?.serverURL || ''}${config?.routes?.api || '/api'}`
  const [choices, setChoices] = useState<Choice[]>([])
  const idKey = ids.join(',')
  useEffect(() => {
    if (!source) {
      setChoices([])
      return
    }
    let live = true
    const wanted = idKey ? idKey.split(',') : []
    fetch(sourceItemsURL(api, source.collection, wanted), { credentials: 'include', headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : { docs: [] }))
      .then((body: { docs?: Record<string, unknown>[] }) => {
        if (!live) {
          return
        }
        const docs = body.docs || []
        const byId = new Map(docs.map((doc) => [String(doc.id), doc]))
        const ordered = wanted.length ? wanted.map((id) => byId.get(id)).filter((d): d is Record<string, unknown> => Boolean(d)) : docs
        setChoices(
          ordered
            .map((doc) => ({ label: asText(doc[source.labelField]), value: asText(doc[source.valueField]) }))
            .filter((c) => c.value),
        )
      })
      .catch(() => live && setChoices([]))
    return () => {
      live = false
    }
  }, [api, source, idKey])
  return choices
}

/**
 * A select, radio or checkbox-group default: a pick-list of the question's own options, "label =
 * value", unsaved edits included; for choices from a collection, the picked items (else the
 * collection's first 100) read through the REST API with the editor's session. Stores the value,
 * or several joined by `,` (`multiple`). A stored value not in the options stays listed.
 */
export const DefaultChoiceField: React.FC<DefaultChoiceFieldProps> = (props) => {
  const { multiple, sources } = props
  const { fieldState, inputProps } = useTextFieldProps(props)
  const { path, setValue, value } = fieldState
  const base = siblingPath(path, '')
  const sourceKey = useFormFields(([fields]) => fields[`${base}optionsFrom`]?.value)
  const source = typeof sourceKey === 'string' && sourceKey !== 'typed' ? sources?.[sourceKey] : undefined
  const typedSignature = useFormFields(([fields]) => (source ? '' : JSON.stringify(typedChoices(fields, base))))
  const idSignature = useFormFields(([fields]) => (source ? pickedIds(fields[`${base}sourceItems`]?.value, source.collection).join(',') : ''))
  const ids = useMemo(() => (idSignature ? idSignature.split(',') : []), [idSignature])
  const fromSource = useSourceChoices(source, ids)
  const choices = useMemo(() => (source ? fromSource : (JSON.parse(typedSignature || '[]') as Choice[])), [source, fromSource, typedSignature])

  const stored = toStringList(value)
  const options: OptionObject[] = choices.map((c) => ({ label: c.label ? `${c.label} = ${c.value}` : c.value, value: c.value }))
  for (const v of stored) {
    if (!choices.some((c) => c.value === v)) {
      options.push({ label: `${v} (not in the options)`, value: v })
    }
  }
  const { placeholder, ...rest } = inputProps
  return (
    <SelectInput
      {...rest}
      hasMany={Boolean(multiple)}
      isClearable
      name={props.field.name}
      onChange={(option) => {
        if (multiple) {
          const list = Array.isArray(option) ? (option as OptionObject[]) : option ? [option as OptionObject] : []
          setValue(list.map((o) => String(o.value)).join(',') || null)
          return
        }
        const picked = Array.isArray(option) ? option[0] : option
        setValue(picked ? String((picked as OptionObject).value) : null)
      }}
      options={options}
      placeholder={typeof placeholder === 'string' ? placeholder : undefined}
      value={multiple ? stored : (stored[0] ?? '')}
    />
  )
}