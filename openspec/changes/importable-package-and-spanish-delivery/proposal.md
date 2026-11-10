## Why

Three gaps stop sites from using payload-dynamic-forms in English and Spanish, so they ship together as 0.3.0.

1. **No app can import the published 0.1.0 or 0.2.0.** Their manifests on npm say `main`, `types` and both `exports` entries are `./src/*.ts`, but the tarball holds only `dist/`, `README.md`, `LICENSE` and `package.json`. The repo keeps the `./src` paths at the top level of `package.json` and the `dist/` paths only under `publishConfig`. `npm publish` doesn't apply `publishConfig.main`, `types` or `exports` (pnpm does, and Yarn applies `main` and `exports`), and the release publishes with `npm publish`. Payload's plugin template uses the same layout because Payload publishes with pnpm. The plugin's own checks missed it: `tests/package.test.ts` reads `publishConfig`, not the manifest that ships, and "Built package exposes both entries" imports `dist/` files by path, not the package by name.
2. **Emails reach a Spanish visitor in English.** An email output's `subject` and `body` are not `localized` (`src/collections/forms.ts` › `deliveryField`), so a visitor copy has one set of words for every language. Everything else the server writes (row labels, Yes and No, the WhatsApp templates) is already localized and already read in the submission's language.
3. **A page's draft preview shows the published form.** `getPublicForm` and `GET /api/<forms>/public/:slug` read published forms only (`src/server/forms.ts` › `loadPublishedForm`), so an editor previewing a page sees the form as it was last published, not the draft they are working on.

## What Changes

- **Packaging (from the planned 0.2.1, unchanged in substance).** `package.json`: `main`, `types` and `exports` point at `./dist/` at the top level, with `types` first in each export; `publishConfig` holds only `access: public`. The dev app and the tests keep reading `src/`. New `yarn check:packed` (`scripts/check-packed.mjs`): packs the package, refuses a manifest entry that isn't in the tarball, installs the tarball with `payload` in a scratch ESM app outside the repo, imports both entries by name and typechecks them. CI runs it after the build; `release.yml` runs it before `npm publish`. The builder proves it refuses the real 0.2.0 tarball.
- **Email words per language.** `subject` and `body` of each email output become `localized`. A visitor copy is written in the submission's language: its subject, body, row labels and Yes/No come from the form read in that locale, and an empty translation falls back to the default locale's words through Payload's own fallback. A team email is written in the app's default locale. The plugin's endpoints use the request locale only when it is one of the app's locale codes (`?locale=all` reads and stores the default locale). `beforeEmail` also receives the locale the email was written in. Apps without localization see no change.
- **Draft read for previews.** `getPublicForm(payload, slug, { draft: true, user })` returns the form's newest draft when that user's own read of the forms collection returns it; anonymous callers and users the read access refuses get the published form as before. `GET /api/<forms>/public/:slug?draft=true` does the same for the request's logged-in user and answers with `Cache-Control: private, no-store`. A draft read also reads option-source items as drafts. Submitting still uses the published form only.
- **Version 0.3.0** (new behaviour under 0.x). Payload peer stays `^3.92.1`.
- **README:** Compatibility says to use 0.3.0 or later; Development lists the packed check; Releasing names it; Words, Options (`beforeEmail`), Rendering and Endpoints describe the two new behaviours; Migrations gets the 0.3.0 note (email subject and body move to the locales table); a new Changelog section starts with 0.3.0.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `package-release`: entry fields at the top level point at `dist/`, version 0.3.0, a packed install check in CI and before publish, dev and tests read `src/` without a build, a README changelog and the 0.3.0 migration note.
- `plugin-setup`: both entries are proven by importing the installed tarball by package name, not `dist/` files by path.
- `form-delivery`: emails are written in their reader's language (visitor copy: the submission's; team: the default locale), with Payload's fallback, unchanged for apps without localization.
- `form-submission`: the public read takes an opt-in draft read for logged-in previews; endpoints use only known locale codes.

## Impact

- Code: `package.json`, `scripts/check-packed.mjs` (new), `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `src/collections/forms.ts`, `src/server/forms.ts`, `src/delivery/run.ts`, `src/endpoints/public.ts`, `src/endpoints/submit.ts`, `src/server/resend.ts`, `src/types.ts`, `dev/payload.config.ts` (a `localization: false` test option), possibly `eslint.config.js`.
- Tests: `tests/package.test.ts`, `tests/workflows.test.ts`, `tests/plugin-config.test.ts`, `tests/readme.test.ts`, `tests/int/submit.int.test.ts`, new `tests/int/email-locale.int.test.ts` and `tests/int/draft-read.int.test.ts`.
- Schema, for apps with localization: each email row's `subject` and `body` move from the email rows table to its `_locales` table (and the same in the versions tables). Apps run their own `payload migrate:create`; the generated migration changes the schema only, so the README tells apps to copy the old values into the default locale's rows (no app can have data yet: 0.1.0 and 0.2.0 don't import). Apps without localization: no schema change.
- API: additive only. `getPublicForm` gains `draft` and `user`; `beforeEmail`'s second argument gains `locale`; the public endpoint gains `?draft=true`.
- `yarn check:packed` needs the npm registry: it installs `payload` and `typescript` into the scratch app. CI and the release runner have it. `yarn test` stays offline.

## Out of scope

- A per-output choice of language, a `{{locale}}` token, the locale in the webhook body, and per-locale defaults for the plugin's `words` option (later, if a site asks).
- The built-in subject `New submission: {{formTitle}}` used when a subject is empty in every locale, and the plugin's default `notFound` words on a 404 (no form is found, so there are no form words to use). Both stay English defaults an app can override.
- Previewing a submit: the submit endpoint keeps reading the published form, so a draft is never sent or stored.
- Deprecating 0.1.0 and 0.2.0 on npm. That needs an npm login: the reviewer's optional step after 0.3.0 is live.
- Publishing 0.3.0. The planner pushes to `main`, which publishes, after review (covered by the reviewer's standing yes of 9 Nov 2026).
- Pinning 0.3.0 in the starter. That is the starter's own change (`dynamic-forms`), repinned after 0.3.0 is verified on the registry and in an install test.
- Changing the publish command or tool. `npm publish --access public --provenance` through trusted publishing stays as 0.2.0 proved it.
- MongoDB and Postgres: not tested here (README › Compatibility).
