/**
 * The one list of rule operators. Every rule field in the forms collection uses this array,
 * and the rule engine handles exactly these values.
 */
export const OPERATORS = [
  { label: 'Equals', value: 'equals' },
  { label: 'Does not equal', value: 'notEquals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Does not contain', value: 'notContains' },
  { label: 'Has a value', value: 'hasValue' },
  { label: 'Has no value', value: 'notHasValue' },
  { label: 'Greater than', value: 'greaterThan' },
  { label: 'Less than', value: 'lessThan' },
  { label: 'Includes option', value: 'includesOption' },
] as const satisfies ReadonlyArray<{ label: string; value: string }>

export type OperatorValue = (typeof OPERATORS)[number]['value']

export const OPERATOR_VALUES: readonly OperatorValue[] = OPERATORS.map((o) => o.value)

export const MATCH_MODES = [
  { label: 'All rules must match', value: 'all' },
  { label: 'Any rule can match', value: 'any' },
] as const
