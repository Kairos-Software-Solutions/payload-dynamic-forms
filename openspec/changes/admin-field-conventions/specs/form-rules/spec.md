## ADDED Requirements

### Requirement: Prefill parameter follows the key
Each input question SHALL have a hidden lock, `prefillFromKey`, like Payload's slug field, whose default is a function (no database default). Locked, the link parameter SHALL equal the key, on screen and on save; unlocked, the editor's parameter (or none) SHALL be kept. New questions SHALL start locked, except single checkbox questions, which start unlocked. 0.3.0 questions have no lock value and SHALL be treated as unlocked, so their parameter is kept.

#### Scenario: New question prefills by its key
- **WHEN** a form is created through the API with a text question keyed ` Full Name ` and no `prefillFromKey` or `prefillParam`
- **THEN** it is stored with `prefillFromKey: true` and `prefillParam: 'full-name'`, and `initialAnswers` with `?full-name=Ana` starts it as `Ana`
- **CHECK** tests/int/form-save.int.test.ts › "new questions are locked and prefill by their key"

#### Scenario: New checkbox question starts unlocked
- **WHEN** a form is created through the API with a single checkbox question keyed `consent` and no `prefillFromKey` or `prefillParam`
- **THEN** it is stored with `prefillFromKey: false` and an empty `prefillParam`, and `initialAnswers` with `?consent=yes` leaves it unticked; saved again with `prefillFromKey: true`, its `prefillParam` is `consent`
- **CHECK** tests/int/form-save.int.test.ts › "new checkbox questions start unlocked"

#### Scenario: Lock default adds no database default
- **WHEN** the test reads `prefillFromKey` in every built-in input block and in an app-defined type
- **THEN** it is a hidden checkbox whose `defaultValue` is a function, returning `false` in the single checkbox block and `true` in every other block
- **CHECK** tests/plugin-config.test.ts › "prefillFromKey default is a function"

#### Scenario: Locked parameter follows a key change
- **WHEN** a locked question's key changes from `need` to `topic` and the form is saved
- **THEN** its `prefillParam` is `topic`
- **CHECK** tests/int/form-save.int.test.ts › "a locked prefill parameter follows the key"

#### Scenario: Unlocked parameter is kept
- **WHEN** a question is saved with `prefillFromKey: false` and `prefillParam: 'ref'`, or with `prefillFromKey: false` and no parameter
- **THEN** it keeps `ref`, or stays without a parameter, after its key changes
- **CHECK** tests/int/form-save.int.test.ts › "an unlocked prefill parameter is kept"

#### Scenario: 0.3.0 question with no parameter stays unprefilled
- **WHEN** a stored question has `prefillFromKey` null and an empty `prefillParam` (written straight to the database, as a 0.3.0 row reads after the migration) and the form is updated through the Local API resending `sections` with every section and question row id, without those two fields
- **THEN** `prefillFromKey` stays null, `prefillParam` stays empty, and `initialAnswers` with `?<key>=x` leaves the default
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions without a parameter stay unprefilled"

#### Scenario: 0.3.0 question with a parameter keeps it
- **WHEN** a stored question has `prefillFromKey` null and `prefillParam: 'need'` while its key is `topic`, and the form is updated through the Local API resending `sections` with their row ids
- **THEN** `prefillParam` is still `need`
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions keep their parameter"

#### Scenario: Lock and unlock in the admin
- **WHEN** the prefill component renders a locked question keyed `need`, the key changes to `topic`, the editor clicks Unlock and types `ref`, then clicks Lock
- **THEN** the input shows `topic` read-only, then `ref` editable with `prefillFromKey` false, then `topic` read-only with `prefillFromKey` true; a row with `prefillFromKey` null renders unlocked with its stored text, and a file upload question shows no lock
- **CHECK** tests/admin/prefill-field.test.tsx › "prefill locks to the key and unlocks to edit"
