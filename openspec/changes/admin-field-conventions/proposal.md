## Why

The reviewer tried the forms plugin (published 0.3.0) on the starter's test site and sent nine points about the forms admin (11 Nov 2026). Most of them are the house conventions for admin fields: labels use the words editors use, a field's identity comes before its rules, keys are formatted as you type, a value derived from another field works like Payload's slug field, references are pick-lists, counts that make a field meaningless are refused, multi-section forms default to step by step, and checkboxes sit level with the inputs beside them. One point (clearing a radio answer) is on the visitor side and is answered here with an editor hint, no visitor code. They ship together as 0.4.0.

## What Changes

- **Required checkbox level with the inputs (point 1).** The checkbox in a question's key row, and the `enabled` checkbox in each email and webhook row, get one shared `admin.style` that lines them up with the inputs beside them. Data unchanged.
- **"Rules", not "Rows" (point 2).** Both rule arrays (`rows` in a show/hide group and in a next-step rule) get the labels "Rule" / "Rules". Field names stay `rows`: no migration.
- **Rules go last (point 3).** Inside every input block, the type's own fields (options, limits, upload settings) come before the default/prefill row and the show/hide group comes last; the same for field types an app adds. Field names stay; only order changes.
- **Prefill works like the slug field (point 4).** A new hidden checkbox `prefillFromKey` (like Payload's `generateSlug`) next to `prefillParam`. Locked (true), the link parameter follows the field key, on screen and on save; unlocked, the editor's own parameter (or none) is kept. New questions start locked, so every new question is prefillable as `?<key>=`, except single checkbox questions, which start unlocked with no parameter so a link can't pre-tick a consent box (an editor can still lock one). Questions saved under 0.3.0 have no value for the lock and keep exactly what they had: an empty parameter stays empty (no prefill), a typed one stays.
- **Keys formatted as you type (point 5).** The question key and the section key format to lower-case kebab-case on every keystroke in the admin. The save-time normalisation stays as the server's guarantee.
- **At least two choices (point 6).** Radio and select: `minRows: 2` on typed options, and a save check that refuses one typed option or exactly one picked collection item. It counts only what the form holds: an empty pick (all published items) is never refused, so a form's save doesn't depend on another collection's publish state. Checkbox groups are unchanged (one tickable option is a valid question).
- **Pick-lists for references (point 7).** A rule's field key and a next-step rule's target section become selects built from the keys in the current form state (unsaved edits included). The stored value stays a text key; a key that is no longer in the form stays visible and the save check still names it.
- **New forms start step by step (point 8).** `presentationMode` defaults to `steps`. Saved forms keep their saved value; "Single page" stays an option. On SQLite and D1 the generated migration for this default rebuilds the forms table and loses its child rows, so those sites hand-write the migration (design › Migration impact for sites).
- **Optional radio questions get an editor hint (point 9, decided by the reviewer: option A).** Under an optional radio question's choices, a description tells editors that visitors can't clear a radio answer and to add an option such as "None of the above" or "Not sure" when no answer is valid (GOV.UK Design System radios guidance). No visitor-side code.
- **New package entry `payload-dynamic-forms/client`** holding the plugin's admin components (key input, prefill lock, rule-key and section pick-lists, the radio hint), referenced from the fields by import-map path. The main and `./shared` entries stay free of React. New peer dependencies `@payloadcms/ui ^3.92.1` and `react ^19.2.1`, which every Payload 3 admin already has.
- **Version 0.4.0** (new behaviour under 0.x). Payload peer stays `^3.92.1`. README: Migrations 0.4.0 note, Changelog 0.4.0, import-map step, the new defaults.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `form-model`: field order, rule labels, level checkboxes, two-choice minimum, step-by-step default, key formatting as you type, pick-lists for rule keys and section targets, the optional-radio hint.
- `form-rules`: the prefill parameter follows the field key unless unlocked; 0.3.0 questions keep their parameter.
- `package-release`: version 0.4.0, the two new peers, a third export, the packed check covering it, the 0.4.0 changelog and migration note.
- `plugin-setup`: the `./client` entry for admin components; main and shared stay React-free.

## Impact

- Code: `src/collections/blocks.ts`, `src/collections/ruleFields.ts`, `src/collections/forms.ts`, `src/hooks/validateForm.ts`, `src/shared/types.ts` (the `prefillFromKey` type), new `src/admin/` (client components and their pure logic), new `src/exports/client.ts`, `package.json`, `tsconfig.json` (paths, `tests/**/*.tsx` include), `tsconfig.build.json`, `vitest.config.js`, `scripts/check-packed.mjs`, `dev/app/(payload)/admin/importMap.js` (regenerated), `README.md`.
- Tests: `tests/plugin-config.test.ts`, `tests/int/form-save.int.test.ts`, `tests/package.test.ts`, `tests/readme.test.ts`, `tests/workers-safe.test.ts`, new `tests/admin-logic.test.ts`, new `tests/admin/*.test.tsx` (jsdom; new devDependencies `jsdom` and `@testing-library/react`), new `tests/fixtures/field-paths-0.3.0.json`.
- Schema for sites (design › Migration impact for sites): one new nullable boolean column per input block table (and its versions table), and the default of `presentation_mode` changes. No rename, no data move. Postgres runs the generated migration; SQLite and D1 sites hand-write it (`ADD COLUMN prefill_from_key` only), because the generated one rebuilds the forms table and loses its child rows.
- Sites must regenerate their admin import map after upgrading (`payload generate:importmap`), or the admin shows missing-component errors for the forms collection.
- API: additive. `getPublicForm`, the endpoints, `initialAnswers` and the shared entry are unchanged.

## Out of scope

- A "Clear selection" link on optional radios: the reviewer chose the admin hint (option A) instead.
- Pick-lists for the email row's `visitorField` and `replyToField` (also references to field keys). Same pattern, later, if the reviewer wants it.
- Renaming `rows`, `fieldKey`, `prefillParam` or `presentationMode`, or rewriting stored data. 0.3.0 forms are not migrated to the lock; editors lock a question when they want it to follow its key.
- Visitor renderers, the starter's own form code and its pin to 0.4.0 (the starter's own change after 0.4.0 is on the registry).
- Publishing 0.4.0: the planner pushes to `main` after review (see SUMMARY).
- Step-mode Continue fix (done in the starter, job-058) and the review screen and section links (dropped by the reviewer).
