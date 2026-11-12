import type { Field } from 'payload'

import { MATCH_MODES, OPERATORS } from '../shared/operators.js'
import { rowLabel } from './rowLabels.js'

/** One rule row: field key (or `key.attribute`), operator from the shared list, value. */
export function ruleRowFields(): Field[] {
  return [
    {
      type: 'row',
      fields: [
        {
          name: 'fieldKey',
          type: 'text',
          admin: {
            components: { Field: 'payload-dynamic-forms/client#RuleFieldKeyField' },
            description: 'A field key, or key.attribute for an attribute of the chosen option.',
            width: '40%',
          },
          label: 'Field',
          required: true,
        },
        {
          name: 'operator',
          type: 'select',
          admin: { width: '30%' },
          dbName: 'op',
          defaultValue: 'equals',
          // The one shared list: every rule field uses this same array.
          options: OPERATORS as unknown as { label: string; value: string }[],
          required: true,
        },
        {
          name: 'value',
          type: 'text',
          admin: { width: '30%' },
        },
      ],
    },
  ]
}

/** The list of rules: labelled Rules, still named `rows` (no data moves). */
function ruleRowsField(): Field {
  return {
    name: 'rows',
    type: 'array',
    admin: { components: { RowLabel: rowLabel('rule') }, initCollapsed: false },
    fields: ruleRowFields(),
    label: 'Rules',
    labels: { plural: 'Rules', singular: 'Rule' },
  }
}

function matchField(): Field {
  return {
    name: 'match',
    type: 'radio',
    dbName: 'mt',
    defaultValue: 'all',
    options: MATCH_MODES as unknown as { label: string; value: string }[],
  }
}

/** A show/hide rule group (`all` or `any` of its rows; empty shows). */
export function ruleGroupField(name = 'visibilityRules', label = 'Show when'): Field {
  return {
    name,
    type: 'group',
    admin: { description: 'Leave empty to always show.' },
    fields: [
      matchField(),
      ruleRowsField(),
    ],
    label,
  }
}

export function nextStepRulesField(): Field {
  return {
    name: 'nextStepRules',
    type: 'array',
    admin: {
      components: { RowLabel: rowLabel('jump') },
      condition: (data) => data?.presentationMode === 'steps',
      description: 'Skips every section in between, even ones whose show rules match.',
      initCollapsed: false,
    },
    fields: [
      {
        name: 'targetSectionKey',
        type: 'text',
        admin: { components: { Field: 'payload-dynamic-forms/client#SectionTargetField' } },
        label: 'Jump to section',
        required: true,
      },
      matchField(),
      ruleRowsField(),
    ],
    label: 'Jump to section when',
    labels: { plural: 'Jumps', singular: 'Jump' },
  }
}

/**
 * Under the jumps: names each section a jump passes over that has its own show rules (the jump
 * skips it whatever they say). Stores nothing; step-by-step forms only, like the jumps.
 */
export function jumpSkipHintField(): Field {
  return {
    name: 'jumpSkipHint',
    type: 'ui',
    admin: {
      components: { Field: 'payload-dynamic-forms/client#JumpSkipHint' },
      condition: (data) => data?.presentationMode === 'steps',
    },
  }
}