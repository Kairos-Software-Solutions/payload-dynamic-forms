/**
 * `payload-dynamic-forms/shared`: the rule engine, answer checks, tokens,
 * messages and words. Runs the same in the browser, on Workers and in the submit endpoint.
 * Imports nothing from Payload, React or Node at runtime.
 */
export {
  answerToText,
  buildSnapshot,
  checkAnswers,
  checkFiles,
  type CheckOptions,
  type CheckResult,
  DEFAULT_FILE_LIMITS,
  type FileLimits,
  isValidEmail,
  normalizeAnswer,
  toStoredAnswers,
} from '../shared/answers.js'
export {
  browserTimeZone,
  type DateContext,
  type DateDisplayStyle,
  type DateMode,
  type DateNow,
  type DateValueFormat,
  formatAnswerDate,
  isTimeZone,
  resolveDateLimit,
  TIME_ZONE_FIELD,
  TODAY,
  toStoredDateAnswer,
  toUtcInstant,
} from '../shared/dates.js'
export { MATCH_MODES, OPERATOR_VALUES, OPERATORS, type OperatorValue } from '../shared/operators.js'
export {
  defaultAnswer,
  evaluateRow,
  evaluateRules,
  getFieldKey,
  getFieldLabel,
  getInputFieldMap,
  getInputFields,
  getOptions,
  getRowLabel,
  getSectionKey,
  getSections,
  getVisibleSections,
  hasAnswer,
  initialAnswers,
  type InputEntry,
  isChoiceBlock,
  isFieldVisible,
  isInputBlock,
  isSectionVisible,
  normalizeKey,
  readRuleValue,
  splitRuleKey,
  type StartContext,
} from '../shared/rules.js'
export { getNextSectionKey, getStepPath, getStepProgress, getVisibility, type Visibility } from '../shared/steps.js'
export {
  buildMessageRows,
  buildTemplateValues,
  escapeHtml,
  interpolate,
  type InterpolateOptions,
  type MessageRow,
  type TokenValue,
} from '../shared/tokens.js'
export type * from '../shared/types.js'
export {
  buildWhatsAppMessage,
  DEFAULT_WHATSAPP_ROW_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
  type WhatsAppMessageOptions,
  whatsappUrl,
} from '../shared/whatsapp.js'
export { DEFAULT_WORDS, fillWords, WORD_KEYS } from '../shared/words.js'