'use client'

import {
  type Answers,
  checkAnswers,
  type FieldBlock,
  getFieldKey,
  getOptions,
  getVisibility,
  initialAnswers,
  type InputBlock,
  isInputBlock,
  type PublicForm,
  type SubmitResult,
} from 'payload-dynamic-forms/shared'
import { type FormEvent, useState } from 'react'

type Props = {
  /** From `getPublicForm(payload, slug)` or `GET /api/custom-forms/public/:slug`. */
  form: PublicForm
  /** The page's search parameters, for prefilled answers (`?need=cameras`). */
  searchParams?: string
}

/** A minimal single-page renderer: every word comes from the form. */
export function MinimalForm({ form, searchParams }: Props) {
  const words = form.wording
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(form, searchParams))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const shown = getVisibility(form, answers)

  const set = (key: string, value: Answers[string]) => setAnswers((current) => ({ ...current, [key]: value }))

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Open the WhatsApp window now, inside the click: after an await, browsers block popups.
    const popup = form.whatsapp ? window.open('', '_blank') : null
    const local = checkAnswers(form, answers, { words })
    if (!local.ok) {
      popup?.close()
      setErrors(local.fieldErrors)
      setMessage(words.errorPrefix)
      return
    }
    setSending(true)
    const response = await fetch(`/api/custom-forms/submit/${form.slug}`, {
      body: JSON.stringify({ ...answers, [form.honeypotField]: '' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = (await response.json()) as SubmitResult
    setSending(false)
    if (!result.ok) {
      popup?.close()
      setErrors(result.fieldErrors || {})
      setMessage(result.message)
      return
    }
    if (result.whatsappUrl && popup) {
      popup.location.href = result.whatsappUrl
    }
    if (result.redirectURL) {
      window.location.assign(result.redirectURL)
      return
    }
    setErrors({})
    setMessage(result.message)
  }

  function renderInput(field: InputBlock, key: string) {
    const label = field.words?.label || key
    const value = answers[key]
    const common = { id: key, name: key, required: Boolean(field.required) }
    switch (field.blockType) {
      case 'checkbox':
        return (
          <label htmlFor={key}>
            <input {...common} checked={value === true} onChange={(e) => set(key, e.target.checked)} type="checkbox" />
            {label}
          </label>
        )
      case 'checkboxGroup':
      case 'radio':
        return (
          <fieldset>
            <legend>{label}</legend>
            {getOptions(field).map((option) => {
              const list = Array.isArray(value) ? value : []
              const checked = field.blockType === 'radio' ? value === option.value : list.includes(String(option.value))
              return (
                <label key={option.value}>
                  <input
                    checked={checked}
                    name={key}
                    onChange={(e) =>
                      field.blockType === 'radio'
                        ? set(key, String(option.value))
                        : set(key, e.target.checked ? [...list, String(option.value)] : list.filter((v) => v !== option.value))
                    }
                    type={field.blockType === 'radio' ? 'radio' : 'checkbox'}
                    value={String(option.value)}
                  />
                  {option.label}
                </label>
              )
            })}
          </fieldset>
        )
      case 'select':
        return (
          <label htmlFor={key}>
            {label}
            <select {...common} onChange={(e) => set(key, e.target.value)} value={String(value ?? '')}>
              <option value="">{words.chooseOne}</option>
              {getOptions(field).map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )
      case 'textarea':
        return (
          <label htmlFor={key}>
            {label}
            <textarea {...common} onChange={(e) => set(key, e.target.value)} placeholder={field.words?.placeholder || undefined} value={String(value ?? '')} />
          </label>
        )
      default:
        return (
          <label htmlFor={key}>
            {label} {field.required ? null : words.optionalHint}
            <input
              {...common}
              onChange={(e) => set(key, e.target.value)}
              placeholder={field.words?.placeholder || undefined}
              type={['date', 'email', 'number'].includes(field.blockType) ? field.blockType : 'text'}
              value={String(value ?? '')}
            />
          </label>
        )
    }
  }

  function renderField(field: FieldBlock, index: number) {
    if (!isInputBlock(field)) {
      return field.blockType === 'heading' ? <h3 key={index}>{field.heading}</h3> : <p key={index}>{field.body}</p>
    }
    const key = getFieldKey(field)
    if (!shown.fieldKeys.has(key)) {
      return null
    }
    return (
      <div key={key}>
        {renderInput(field, key)}
        {field.words?.hint ? <small>{field.words.hint}</small> : null}
        {errors[key] ? <strong role="alert">{errors[key]}</strong> : null}
      </div>
    )
  }

  if (form.intakeState === 'closed') {
    return <p>{words.closed}</p>
  }
  return (
    <form noValidate onSubmit={onSubmit}>
      {form.sections
        .filter((section) => shown.sectionKeys.includes(String(section.key)))
        .map((section) => (
          <section key={String(section.key)}>
            {section.title ? <h2>{section.title}</h2> : null}
            {(section.fields || []).map(renderField)}
          </section>
        ))}
      <input aria-hidden autoComplete="off" hidden name={form.honeypotField} tabIndex={-1} />
      {message ? <p role="status">{message}</p> : null}
      <button disabled={sending} type="submit">
        {sending ? words.sending : words.send}
      </button>
    </form>
  )
}
