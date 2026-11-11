## ADDED Requirements

### Requirement: Field order inside a question
Inside every input block, what the question is SHALL come first (key row, words, the type's own fields such as options, limits and upload settings), then the default and prefill row, and the show/hide rules SHALL come last. Field types an app adds SHALL put their own fields before the default and prefill row and the rules. No field SHALL be renamed: the order changes, the stored names do not.

#### Scenario: Rules come last in every built-in block
- **WHEN** the test reads the top-level fields of each built-in input block (rows and collapsibles opened)
- **THEN** `visibilityRules` is the last data field, and for radio and select `options` comes before `defaultValue`, `prefillParam` and `visibilityRules`
- **CHECK** tests/plugin-config.test.ts › "rules come last in every built-in input block"

#### Scenario: App field types put their fields before the rules
- **WHEN** an app registers a field type whose block has a `rating` number field
- **THEN** the block's fields are the key row and words, then `rating`, then the default and prefill row, then `visibilityRules`
- **CHECK** tests/plugin-config.test.ts › "app field types put their own fields before the rules"

#### Scenario: Field names are unchanged
- **WHEN** the test flattens every data path of every built-in block and compares it with the 0.3.0 list in tests/fixtures/field-paths-0.3.0.json
- **THEN** every 0.3.0 path is still there, and the only new paths are `prefillFromKey` in each input block
- **CHECK** tests/plugin-config.test.ts › "field names are unchanged from 0.3.0 apart from prefillFromKey"

### Requirement: Rule lists labelled Rules
The arrays of rules in a show/hide group and in a next-step rule SHALL be labelled "Rule" (singular) and "Rules" (plural) and SHALL keep the name `rows`, so no stored data moves. A rule's field key SHALL be labelled "Field" and a next-step rule's target "Next section", with their names unchanged.

#### Scenario: Rule arrays read Rules and keep their name
- **WHEN** the test reads the field show/hide group, the section show/hide group and the next-step rule
- **THEN** each has an array named `rows` with labels `{ singular: 'Rule', plural: 'Rules' }`
- **CHECK** tests/plugin-config.test.ts › "rule arrays are labelled Rules and still named rows"

#### Scenario: Rule fields read Field and Next section
- **WHEN** the test reads the rule rows of the field show/hide group, the section show/hide group and the next-step rule
- **THEN** each rule's `fieldKey` has the label "Field" and the next-step rule's `targetSectionKey` has the label "Next section", both still `type: 'text'` with those names
- **CHECK** tests/plugin-config.test.ts › "rule fields are labelled Field and Next section"

### Requirement: Checkboxes level with the inputs
A checkbox that shares a row with inputs SHALL carry the plugin's shared level style in `admin.style`: a question's `required`, and the `enabled` of each email and webhook row. Names, defaults and widths SHALL stay as in 0.3.0.

#### Scenario: Row checkboxes carry the level style
- **WHEN** the test reads `required` in every input block and `enabled` in the email and webhook rows
- **THEN** each has `admin.style` equal to `LEVEL_CHECKBOX_STYLE`, and its name, default and width are unchanged
- **CHECK** tests/plugin-config.test.ts › "row checkboxes carry the level style"

### Requirement: At least two choices for radio and select
A radio or select question SHALL have at least two choices: typed options SHALL have `minRows: 2`, and saving SHALL refuse a radio or select whose typed choices number fewer than two or that picks exactly one collection item. An empty pick SHALL never be counted or refused, so a save never depends on another collection's publish state. Checkbox groups SHALL keep allowing one option.

#### Scenario: One typed choice is refused
- **WHEN** a form is saved with a radio, or a select, that has one typed option
- **THEN** the save fails with a message naming the question and saying it needs at least 2 choices; with two options it saves
- **CHECK** tests/int/form-save.int.test.ts › "radio and select need at least two typed choices"

#### Scenario: One picked item is refused
- **WHEN** a radio, or a select, takes its choices from a collection and exactly one item is picked
- **THEN** the save fails with the same message; with two picked items it saves, and with none picked it saves even when the collection has only one published item
- **CHECK** tests/int/form-save.int.test.ts › "radio and select refuse a single picked item"

#### Scenario: Checkbox group keeps one option
- **WHEN** a checkbox group with one typed option is saved
- **THEN** it saves, and the typed options of radio and select have `minRows: 2` while the checkbox group's have none
- **CHECK** tests/int/form-save.int.test.ts › "a checkbox group may have one option"; tests/plugin-config.test.ts › "radio and select options have minRows 2"

### Requirement: New forms start step by step
A new form's presentation mode SHALL start as "Step by step"; "Single page" SHALL stay an option. A saved form SHALL keep its saved mode.

#### Scenario: New form defaults to step by step
- **WHEN** a form is created without a presentation mode
- **THEN** it is stored with `presentationMode: 'steps'`, and the field's options are "Step by step" and "Single page"
- **CHECK** tests/int/form-save.int.test.ts › "new forms default to step by step"

#### Scenario: Saved single-page form keeps its mode
- **WHEN** a form saved with `singlePage` is updated without sending a presentation mode
- **THEN** it still reads `singlePage`, and the public read returns `singlePage`
- **CHECK** tests/int/form-save.int.test.ts › "saved single-page forms keep their mode"

### Requirement: Keys formatted as you type
The admin inputs for a question key and a section key SHALL format the text to lower-case kebab-case on every change, keeping one trailing dash while typing, and SHALL keep the caret after the characters typed. Saving SHALL still normalise keys.

#### Scenario: Formatter matches the save normalisation
- **WHEN** `formatKeyInput` gets ` Project Type`, `Project_Type!`, `--a  b--` and `Ñame 2`
- **THEN** it returns `project-type`, `project-type-`, `a-b-` and `ame-2`, and with a trailing dash removed each result equals `normalizeKey` of the same text
- **CHECK** tests/admin-logic.test.ts › "key formatter matches normalizeKey"

#### Scenario: Caret stays after the typed text
- **WHEN** `caretAfterFormat` gets `Project Type` with the caret after `Project T`
- **THEN** it returns the offset after `project-t` in the formatted text
- **CHECK** tests/admin-logic.test.ts › "caret stays after the typed characters"

#### Scenario: Key field formats on change
- **WHEN** the key field component is rendered on a question and receives the change `Project Type`
- **THEN** the form value becomes `project-type`, and the field config of `fieldKey` and the section `key` names `payload-dynamic-forms/client#KeyField`
- **CHECK** tests/admin/key-field.test.tsx › "key field formats the value as you type"; tests/plugin-config.test.ts › "key fields use the KeyField component"

### Requirement: References are pick-lists
A rule's field key and a next-step rule's target section SHALL be chosen from lists built from the current form state, including unsaved edits. Stored values SHALL stay text. A stored value no longer in the form SHALL stay visible, and the save check SHALL still refuse it.

#### Scenario: Rule key picks from the form's keys
- **WHEN** the form state has questions `name`, `need` (choices from a collection) and a heading, and the rule key component renders
- **THEN** the choices are `name` and `need` in form order, picking `need` shows the attribute input, and typing `fieldSet` stores `need.fieldSet`
- **CHECK** tests/admin/pick-lists.test.tsx › "rule key lists the form's input keys and keeps the attribute"

#### Scenario: Next section picks from the other sections
- **WHEN** the form state has sections `about`, `details` and `done`, and the target component renders in `details`
- **THEN** the choices are `about` and `done`
- **CHECK** tests/admin/pick-lists.test.tsx › "next section lists the other sections"

#### Scenario: Unsaved keys appear at once
- **WHEN** a question's key in the form state changes from `need` to `topic` without saving
- **THEN** the rule key choices show `topic` and not `need`
- **CHECK** tests/admin/pick-lists.test.tsx › "pick-lists follow unsaved keys"

#### Scenario: Stale value stays visible
- **WHEN** a rule's stored key is `old-key`, which the form no longer has
- **THEN** the list shows `old-key (not in this form)` selected, and saving the form fails naming `old-key`
- **CHECK** tests/admin/pick-lists.test.tsx › "a stored key not in the form stays visible"; tests/int/form-save.int.test.ts › "missing rule keys and duplicate keys are rejected"

### Requirement: Hint under optional radio questions
An optional radio question SHALL show editors a description under its choices saying visitors can't clear a radio answer and suggesting a "None of the above" or "Not sure" choice when no answer is valid. It SHALL store nothing and add no visitor code.

#### Scenario: Hint shows only while the radio is optional
- **WHEN** the test reads the radio block and evaluates the hint's condition with `required` false and true
- **THEN** a `ui` field `noAnswerHint` sits after the choice fields, its condition is true then false, select and checkbox group have no such field, and the component renders the text naming "None of the above" and "Not sure"
- **CHECK** tests/plugin-config.test.ts › "optional radio questions carry the no-answer hint"; tests/admin/no-answer-hint.test.tsx › "hint names none of the above and not sure"
