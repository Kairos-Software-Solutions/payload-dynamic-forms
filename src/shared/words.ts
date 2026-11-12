import type { FormWords } from './types.js'

/**
 * Starting values of every "Form wording" field. Apps change them per form in Payload, or for
 * new forms with the plugin's `words` option. `getPublicForm` uses them only for empty fields.
 */
export const DEFAULT_WORDS: Readonly<FormWords> = Object.freeze({
  back: 'Back',
  chooseOne: 'Choose one',
  closed: 'This form is closed.',
  continue: 'Continue',
  errorPrefix: 'Please check the fields marked below.',
  fileRejected: '{{label}}: this file cannot be accepted.',
  genericError: 'Something went wrong. Please try again.',
  invalid: '{{label}} is not valid.',
  no: 'No',
  notFound: 'This form could not be found.',
  optionalHint: '(optional)',
  required: '{{label}} is required.',
  securityCheckFailed: 'The security check failed. Please try again.',
  send: 'Send',
  /** The button that starts the form again after a success message (when the form offers it). */
  sendAnother: 'Send another',
  sending: 'Sending…',
  sent: 'Sent',
  stepProgress: 'Step {{current}} of {{total}}',
  success: 'Thanks. Your submission has been received.',
  tooManyTries: 'Too many tries. Please wait a few minutes and try again.',
  yes: 'Yes',
})

export const WORD_KEYS = Object.keys(DEFAULT_WORDS) as Array<keyof FormWords>

/** Fills every empty word from `defaults` (default: `DEFAULT_WORDS`). */
export function fillWords(
  words: null | Partial<Record<keyof FormWords, null | string>> | undefined,
  defaults: Partial<FormWords> = DEFAULT_WORDS,
): FormWords {
  const out = { ...DEFAULT_WORDS, ...defaults }
  for (const key of WORD_KEYS) {
    const value = words?.[key]
    if (typeof value === 'string' && value.trim()) {
      out[key] = value
    }
  }
  return out
}