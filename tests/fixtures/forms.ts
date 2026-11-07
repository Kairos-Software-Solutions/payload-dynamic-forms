import type { FormLike, InputBlock } from '../../src/exports/shared.js'

export function input(blockType: string, fieldKey: string, extra: Partial<InputBlock> = {}): InputBlock {
  return { blockType, fieldKey, ...extra, words: { label: fieldKey.replace(/-/g, ' '), ...extra.words } }
}

/** Neutral topics with the attributes a topic-driven WhatsApp form uses. */
export const TOPIC_OPTIONS = [
  {
    attributes: { closer: 'Thanks, talk soon.', fieldSet: 'item', opener: 'Hello! I have a question about cameras.' },
    label: 'Cameras',
    value: 'cameras',
  },
  {
    attributes: { closer: 'Thank you.', fieldSet: 'service', opener: 'Hello! I need a lens cleaned.' },
    label: 'Lens cleaning',
    value: 'lens-cleaning',
  },
  {
    attributes: { closer: 'Bye for now.', fieldSet: 'item', opener: 'Hi! About tripods.' },
    label: 'Tripods',
    value: 'tripods',
  },
]

/** The topic-driven WhatsApp form shape: name, a topic, item-set and service-set sections. */
export function topicForm(): FormLike {
  return {
    presentationMode: 'singlePage',
    sections: [
      {
        fields: [
          input('text', 'name', { required: true, words: { label: 'Your name', rowLabel: 'Name' } }),
          input('radio', 'need', {
            options: TOPIC_OPTIONS,
            prefillParam: 'need',
            required: true,
            words: { label: 'What is it about?', rowLabel: 'Topic' },
          }),
        ],
        key: 'start',
        title: 'Start',
      },
      {
        fields: [
          input('text', 'item', { required: true, words: { label: 'Which model?', rowLabel: 'Model' } }),
          input('text', 'link', { words: { label: 'Link to the item', rowLabel: 'Link' } }),
          input('textarea', 'notes', { words: { label: 'Anything else?', rowLabel: 'Notes' } }),
        ],
        key: 'item-set',
        title: 'The item',
        visibilityRules: { rows: [{ fieldKey: 'need.fieldSet', operator: 'equals', value: 'item' }] },
      },
      {
        fields: [input('text', 'service-detail', { required: true, words: { label: 'What needs doing?', rowLabel: 'Job' } })],
        key: 'service-set',
        title: 'The service',
        visibilityRules: { rows: [{ fieldKey: 'need.fieldSet', operator: 'equals', value: 'service' }] },
      },
    ],
    title: 'Message us',
  }
}
