/**
 * Types shared by the browser and the server. Type-only: nothing here runs.
 */

import type { OperatorValue } from './operators.js'

export type MatchMode = 'all' | 'any'
export type PresentationMode = 'singlePage' | 'steps'
export type IntakeState = 'closed' | 'open'
export type SubmissionStatus = 'failed' | 'partlyFailed' | 'processed' | 'received'

export type RuleRow = {
  /** A field key, or `<field key>.<attribute>` for an attribute of the chosen option. */
  fieldKey?: null | string
  id?: null | string
  operator?: null | OperatorValue
  value?: null | string
}

export type RuleGroup = {
  match?: MatchMode | null
  rows?: null | RuleRow[]
}

export type NextStepRule = {
  targetSectionKey?: null | string
} & RuleGroup

/** A choice as the renderer and the checks see it (typed or resolved from a source). */
export type ChoiceOption = {
  attributes?: Record<string, unknown>
  label?: null | string
  value?: null | string
}

/** The words one question shows. */
export type FieldWords = {
  errorEmpty?: null | string
  errorInvalid?: null | string
  hint?: null | string
  label?: null | string
  placeholder?: null | string
  /** Label of this answer's row in messages; falls back to `label`. */
  rowLabel?: null | string
}

export type BuiltInFieldType =
  | 'checkbox'
  | 'checkboxGroup'
  | 'date'
  | 'email'
  | 'fileUpload'
  | 'heading'
  | 'helpText'
  | 'number'
  | 'radio'
  | 'select'
  | 'text'
  | 'textarea'

export type DisplayBlock = {
  blockName?: null | string
  blockType: 'heading' | 'helpText'
  body?: null | string
  heading?: null | string
  id?: null | string
  level?: 'h2' | 'h3' | 'h4' | null
}

export type InputBlock = {
  [extra: string]: unknown
  blockName?: null | string
  /** Any input type: a built-in one or one an app registered. */
  blockType: string
  defaultValue?: unknown
  fieldKey?: null | string
  id?: null | string
  max?: null | number
  maxDate?: null | string
  /** Files per field (file upload). */
  maxFiles?: null | number
  /** Largest file in MB (file upload). */
  maxFileSizeMB?: null | number
  maxLength?: null | number
  /** Allowed MIME types (file upload); empty = the plugin's list. */
  mimeTypes?: null | string[]
  min?: null | number
  minDate?: null | string
  minLength?: null | number
  options?: ChoiceOption[] | null
  optionsFrom?: null | string
  /** Name of a link (search) parameter that prefills this input. */
  prefillParam?: null | string
  required?: boolean | null
  visibilityRules?: null | RuleGroup
  width?: 'full' | 'half' | null
  words?: FieldWords | null
}

export type FieldBlock = DisplayBlock | InputBlock

export type FormSection = {
  description?: null | string
  fields?: FieldBlock[] | null
  id?: null | string
  key?: null | string
  nextStepRules?: NextStepRule[] | null
  title?: null | string
  visibilityRules?: null | RuleGroup
}

export type FormWords = {
  back: string
  chooseOne: string
  closed: string
  continue: string
  errorPrefix: string
  fileRejected: string
  genericError: string
  invalid: string
  /** An unticked checkbox in messages, tokens and the snapshot. */
  no: string
  notFound: string
  optionalHint: string
  required: string
  securityCheckFailed: string
  send: string
  sending: string
  sent: string
  stepProgress: string
  success: string
  tooManyTries: string
  /** A ticked checkbox in messages, tokens and the snapshot. */
  yes: string
}

/** The words `answerToText` needs: the form's `yes` and `no`. */
export type YesNoWords = Pick<FormWords, 'no' | 'yes'>

/** The shape the rule engine needs: sections (with resolved choices) and optionally the words. */
export type FormLike = {
  presentationMode?: null | PresentationMode
  sections?: FormSection[] | null
  title?: null | string
  wording?: null | Partial<FormWords>
}

/** A form as `getPublicForm` and `GET /api/<forms>/public/:slug` return it. */
export type PublicForm = {
  honeypotField: string
  id: number | string
  intakeState: IntakeState
  presentationMode: PresentationMode
  sections: FormSection[]
  slug: string
  /** True when the server runs the honeypot, Turnstile and rate limit for this form. */
  spamChecks: boolean
  successRedirectURL?: null | string
  successType: 'message' | 'redirect'
  title: string
  turnstile: { enabled: boolean; fieldName: string }
  whatsapp?: { number: string }
  wording: FormWords
}

export type FileAnswer = {
  attachmentIds: Array<number | string>
  filenames: string[]
}

export type AnswerValue = boolean | FileAnswer | null | number | string | string[]

export type Answers = Record<string, AnswerValue>

/** A file as the checks see it: a browser `File` or anything with name, type and size. */
export type FileLike = { name?: string; size: number; type?: string }

export type SnapshotRow = {
  fieldKey: string
  label: string
  sectionKey: string
  sectionTitle: string
  value: string
}

/** Checks an app adds for its own field type (the plugin's `fields` registry). */
export type FieldTypeChecks = {
  normalize?: (raw: unknown, field: InputBlock) => AnswerValue
  toText?: (value: AnswerValue, field: InputBlock, words: YesNoWords) => string
  /** Return `true` when the value is fine, or the error words to show. */
  validate?: (value: AnswerValue, ctx: { answers: Answers; field: InputBlock }) => string | true
}

export type SubmitResult =
  | {
      fieldErrors?: Record<string, string>
      message: string
      ok: false
    }
  | {
      message: string
      ok: true
      redirectURL?: string
      submissionId?: number | string
      whatsappUrl?: string
    }
