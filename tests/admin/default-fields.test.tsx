// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { DateValueField } from '../../src/admin/DateValueField.js'
import { DefaultChoiceField } from '../../src/admin/DefaultChoiceField.js'
import { NumberDefaultField } from '../../src/admin/NumberDefaultField.js'
import { datePickers, form, optionTexts } from './payload-ui-mock.js'

vi.mock('@payloadcms/ui', async () => (await import('./payload-ui-mock.js')).uiMock)
vi.mock('@payloadcms/ui/shared', async () => (await import('./payload-ui-mock.js')).sharedMock)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  datePickers.length = 0
})

const q = 'sections.0.fields.1'
const defaultPath = `${q}.defaultValue`
const defaultField = (label = 'Default Value') => ({ name: 'defaultValue', admin: { width: '50%' }, label }) as never

describe('default fields', () => {
  test("choice default lists the question's options", () => {
    act(() =>
      form.reset({
        [`${q}.blockType`]: 'radio',
        [`${q}.options.0.label`]: 'Quote',
        [`${q}.options.0.value`]: 'quote',
        [`${q}.options.1.label`]: 'Visit',
        [`${q}.options.1.value`]: 'visit',
        [defaultPath]: '',
      }),
    )
    render(<DefaultChoiceField field={defaultField()} path={defaultPath} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Default Value')
    expect(optionTexts(select)).toEqual(['Quote = quote', 'Visit = visit'])
    // An option added without saving shows at once.
    act(() => {
      form.set(`${q}.options.2.label`, 'Call back')
      form.set(`${q}.options.2.value`, 'call')
    })
    expect(optionTexts(select)).toEqual(['Quote = quote', 'Visit = visit', 'Call back = call'])
    fireEvent.change(select, { target: { value: 'visit' } })
    expect(form.get(defaultPath)).toBe('visit')
    fireEvent.change(select, { target: { value: 'call' } })
    expect(form.get(defaultPath)).toBe('call')
    // A stored value the options no longer have stays listed and selected.
    act(() => form.set(defaultPath, 'gone'))
    expect(optionTexts(select)).toEqual(['Quote = quote', 'Visit = visit', 'Call back = call', 'gone (not in the options)'])
    expect(select.value).toBe('gone')
    // Clearing stores no default.
    fireEvent.change(select, { target: { value: '' } })
    expect(form.get(defaultPath)).toBeNull()
  })

  test('checkbox group default picks several options', () => {
    act(() =>
      form.reset({
        [`${q}.blockType`]: 'checkboxGroup',
        [`${q}.options.0.label`]: 'A',
        [`${q}.options.0.value`]: 'a',
        [`${q}.options.1.label`]: 'B',
        [`${q}.options.1.value`]: 'b',
        [`${q}.options.2.label`]: 'C',
        [`${q}.options.2.value`]: 'c',
        [defaultPath]: 'a,z',
      }),
    )
    render(<DefaultChoiceField field={defaultField()} multiple path={defaultPath} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Default Value')
    expect(select.multiple).toBe(true)
    expect(optionTexts(select)).toEqual(['A = a', 'B = b', 'C = c', 'z (not in the options)'])
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['a', 'z'])
    for (const option of [...select.options]) {
      option.selected = option.value === 'a' || option.value === 'c'
    }
    fireEvent.change(select)
    expect(form.get(defaultPath)).toBe('a,c')
    for (const option of [...select.options]) {
      option.selected = false
    }
    fireEvent.change(select)
    expect(form.get(defaultPath)).toBeNull()
  })

  test('collection default lists the picked items', async () => {
    const docs = [
      { id: 7, slug: 'cameras', label: 'Cameras' },
      { id: 9, slug: 'tripods', label: 'Tripods' },
    ]
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      const picked = /where\[id\]\[in\]=([^&]*)/.exec(url)?.[1]
      const ids = picked ? picked.split(',') : null
      return Promise.resolve(Response.json({ docs: ids ? docs.filter((d) => ids.includes(String(d.id))).reverse() : [...docs, { id: 11, slug: 'lights', label: 'Lights' }] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const sources = { topics: { collection: 'topics', labelField: 'label', valueField: 'slug' } }
    act(() =>
      form.reset({
        [`${q}.blockType`]: 'select',
        [`${q}.options.0.label`]: 'Typed',
        [`${q}.options.0.value`]: 'typed-one',
        [`${q}.optionsFrom`]: 'topics',
        [`${q}.sourceItems`]: [
          { relationTo: 'topics', value: 7 },
          { relationTo: 'topics', value: 9 },
        ],
        [defaultPath]: 'tripods',
      }),
    )
    render(<DefaultChoiceField field={defaultField()} path={defaultPath} sources={sources} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Default Value')
    await waitFor(() => expect(optionTexts(select)).toEqual(['Cameras = cameras', 'Tripods = tripods']))
    expect(select.value).toBe('tripods')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url.startsWith('https://cms.example.com/api/topics?')).toBe(true)
    expect(url).toContain('where[id][in]=7,9')
    expect(url).toContain('depth=0')
    expect(url).toContain('draft=true')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
    fireEvent.change(select, { target: { value: 'cameras' } })
    expect(form.get(defaultPath)).toBe('cameras')
    // An empty pick lists the collection's items.
    act(() => form.set(`${q}.sourceItems`, []))
    await waitFor(() => expect(optionTexts(select)).toEqual(['Cameras = cameras', 'Tripods = tripods', 'Lights = lights']))
    const emptyUrl = String(fetchMock.mock.calls.at(-1)![0])
    expect(emptyUrl).not.toContain('where[id]')
    expect(emptyUrl).toContain('depth=0')
    expect(emptyUrl).toContain('draft=true')
  })

  test("date value field writes the mode's format and today", () => {
    const pickerProps = () => datePickers.at(-1) as Record<string, unknown>
    const modePath = `${q}.mode`
    const minPath = `${q}.minDate`
    const cases = [
      { appearance: 'dayOnly', format: 'yyyy-MM-dd', mode: null, pick: '2026-12-01T12:00:00.000Z', stored: '2026-12-01', word: 'Today' },
      { appearance: 'dayOnly', format: 'yyyy-MM-dd', mode: 'dayOnly', pick: '2026-12-01T12:00:00.000Z', stored: '2026-12-01', word: 'Today' },
      {
        appearance: 'dayAndTime',
        format: 'yyyy-MM-dd HH:mm',
        mode: 'dayAndTime',
        pick: new Date(2026, 11, 1, 9, 30).toISOString(),
        stored: '2026-12-01T09:30',
        word: 'Now',
      },
      { appearance: 'timeOnly', format: 'HH:mm', mode: 'timeOnly', pick: new Date(2026, 11, 1, 14, 45).toISOString(), stored: '14:45', word: 'Now' },
    ]
    for (const c of cases) {
      cleanup()
      datePickers.length = 0
      act(() => form.reset({ [`${q}.blockType`]: 'date', [defaultPath]: null, [modePath]: c.mode }))
      render(<DateValueField field={defaultField()} path={defaultPath} />)
      const props = pickerProps()
      expect(props.pickerAppearance, String(c.mode)).toBe(c.appearance)
      expect(props.displayFormat, String(c.mode)).toBe(c.format)
      if (c.appearance === 'dayOnly') {
        expect(props.timeFormat).toBeUndefined()
        expect(props.timeIntervals).toBeUndefined()
      } else {
        expect(props.timeFormat, String(c.mode)).toBe('HH:mm')
        expect(props.timeIntervals, String(c.mode)).toBe(15)
      }
      fireEvent.change(screen.getByLabelText('date picker'), { target: { value: c.pick } })
      expect(form.get(defaultPath), String(c.mode)).toBe(c.stored)
      // The stored text goes back to the picker as a value.
      expect(pickerProps().value).toBeInstanceOf(Date)
      const relative = screen.getByLabelText<HTMLInputElement>(c.word)
      expect(relative.checked).toBe(false)
      fireEvent.click(relative)
      expect(form.get(defaultPath), String(c.mode)).toBe('today')
      expect(screen.getByLabelText<HTMLInputElement>(c.word).checked).toBe(true)
      expect(pickerProps().value).toBeUndefined()
      fireEvent.click(screen.getByLabelText(c.word))
      expect(form.get(defaultPath)).toBeNull()
    }
    // Limits: Today on Date questions, nothing relative on a Time question's limits.
    cleanup()
    act(() => form.reset({ [minPath]: null, [modePath]: 'dayOnly' }))
    render(<DateValueField field={{ name: 'minDate', label: 'Earliest' } as never} limit path={minPath} />)
    fireEvent.click(screen.getByLabelText('Today'))
    expect(form.get(minPath)).toBe('today')
    act(() => form.set(modePath, 'timeOnly'))
    expect(screen.queryByLabelText('Now')).toBeNull()
    expect(screen.queryByLabelText('Today')).toBeNull()
    expect((datePickers.at(-1) as Record<string, unknown>).pickerAppearance).toBe('timeOnly')
  })

  test('number default is a number input inside min and max', () => {
    act(() => form.reset({ [`${q}.blockType`]: 'number', [`${q}.max`]: 10, [`${q}.min`]: 1, [defaultPath]: null }))
    render(<NumberDefaultField field={defaultField()} path={defaultPath} />)
    const input = screen.getByLabelText<HTMLInputElement>('Default Value')
    expect(input.type).toBe('number')
    expect(input.getAttribute('min')).toBe('1')
    expect(input.getAttribute('max')).toBe('10')
    fireEvent.change(input, { target: { value: '7' } })
    expect(form.get(defaultPath)).toBe('7')
    expect(input.value).toBe('7')
    fireEvent.change(input, { target: { value: '' } })
    expect(form.get(defaultPath)).toBeNull()
    // Min and Max follow unsaved edits; the row width reaches the field.
    act(() => form.set(`${q}.max`, 20))
    expect(input.getAttribute('max')).toBe('20')
    expect((input.closest('.field-type') as HTMLElement).style.getPropertyValue('--field-width')).toBe('50%')
  })
})