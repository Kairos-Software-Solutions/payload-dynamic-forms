## ADDED Requirements

### Requirement: Prefill parameter follows the key
Each input question SHALL have a hidden lock, `prefillFromKey`, like Payload's slug field. Locked, the link parameter SHALL equal the question's key, on screen and on save; unlocked, the editor's parameter (or none) SHALL be kept. New questions SHALL start locked. Questions saved under 0.3.0 have no lock value and SHALL be treated as unlocked, so their parameter, empty or not, is kept.

#### Scenario: New question prefills by its key
- **WHEN** a form is created through the API with a text question keyed ` Full Name ` and no `prefillFromKey` or `prefillParam`
- **THEN** it is stored with `prefillFromKey: true` and `prefillParam: 'full-name'`, and `initialAnswers` with `?full-name=Ana` starts it as `Ana`
- **CHECK** tests/int/form-save.int.test.ts › "new questions are locked and prefill by their key"

#### Scenario: Locked parameter follows a key change
- **WHEN** a locked question's key changes from `need` to `topic` and the form is saved
- **THEN** its `prefillParam` is `topic`
- **CHECK** tests/int/form-save.int.test.ts › "a locked prefill parameter follows the key"

#### Scenario: Unlocked parameter is kept
- **WHEN** a question is saved with `prefillFromKey: false` and `prefillParam: 'ref'`, or with `prefillFromKey: false` and no parameter
- **THEN** it keeps `ref`, or stays without a parameter, after its key changes
- **CHECK** tests/int/form-save.int.test.ts › "an unlocked prefill parameter is kept"

#### Scenario: 0.3.0 question with no parameter stays unprefilled
- **WHEN** a stored question has `prefillFromKey` null and an empty `prefillParam` (written straight to the database, as a 0.3.0 row reads after the migration) and the form is updated through the API without those fields
- **THEN** `prefillFromKey` stays null, `prefillParam` stays empty, and `initialAnswers` with `?<key>=x` leaves the default
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions without a parameter stay unprefilled"

#### Scenario: 0.3.0 question with a parameter keeps it
- **WHEN** a stored question has `prefillFromKey` null and `prefillParam: 'need'` while its key is `topic`, and the form is updated
- **THEN** `prefillParam` is still `need`
- **CHECK** tests/int/form-save.int.test.ts › "0.3.0 questions keep their parameter"

#### Scenario: Lock and unlock in the admin
- **WHEN** the prefill component renders a locked question keyed `need`, the key changes to `topic`, the editor clicks Unlock and types `ref`, then clicks Lock
- **THEN** the input shows `topic` read-only, then `ref` editable with `prefillFromKey` false, then `topic` read-only with `prefillFromKey` true; a row with `prefillFromKey` null renders unlocked with its stored text, and a file upload question shows no lock
- **CHECK** tests/admin/prefill-field.test.tsx › "prefill locks to the key and unlocks to edit"
