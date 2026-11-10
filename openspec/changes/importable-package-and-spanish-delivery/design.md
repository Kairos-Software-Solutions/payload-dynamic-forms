## Context

**Packaging.** 0.1.0 and 0.2.0 were scaffolded from Payload's plugin template, which keeps `main`, `types` and `exports` at `./src/*.ts` and puts the `./dist/*` paths under `publishConfig`. The template relies on `pnpm publish` to swap them in. This repo publishes with `npm publish` (`.github/workflows/release.yml`, trusted publishing), which ships the top-level fields as written. The planner checked the registry on 9 Nov 2026: 0.1.0 and 0.2.0 both list `main`/`types` `./src/index.ts` and `exports` `./src/*.ts`, with 99 files in `dist/` only. So `import 'payload-dynamic-forms'` fails in every app.

What reads the package today, in this repo:

- `dev/payload.config.ts` imports `../src/index.js` by relative path.
- Every test imports `../src/...` or `../../src/...` by relative path.
- `examples/minimal-form.tsx` imports `payload-dynamic-forms/shared` by name. Only the typecheck reads it, and `tsconfig.json` `paths` map both package names to `src/`. vitest gets the same mapping through `vite-tsconfig-paths`.
- `dev/app/(payload)/admin/importMap.js` is empty: the package ships no admin components.

So nothing in dev or tests resolves the package through its own `exports`.

**Locales today.** The submit endpoint reads the form in `req.locale` (`src/endpoints/submit.ts` lines 58-59) and stores it as `metadata.locale` (line 178). Resend reads the form in the stored locale (`src/server/resend.ts` line 33). So every localized word the server writes already follows the submission's language: row labels (`words.label`, `words.rowLabel` in `src/collections/blocks.ts`), Yes and No (Form wording), choice labels and the WhatsApp message and row templates (`localized: true`, `src/collections/forms.ts` lines 200-213). Only an email output's `subject` and `body` (lines 139-145) are not localized. The dev app already has locales `en` and `es` with fallback on (`dev/payload.config.ts`).

**Drafts today.** Forms keep drafts (`versions.drafts`, no autosave). Read access is `req.user ? true : { _status: { equals: 'published' } }`. `loadPublishedForm` reads as an anonymous visitor with `draft: false` and a `_status: published` filter, then reads the same document trusted for its delivery settings; `getPublicForm` and the public endpoint use it, so both return the published form only. Option-source items are read with `draft: false` and, for collections with drafts, published only (`resolveChoices`).

## Goals / Non-Goals

**Goals:**
- The published manifest points at files in the tarball. Both entries import by name in a plain ESM app and their types resolve. A broken manifest fails CI and stops the release before `npm publish`. Dev and tests keep reading `src/` with no build step.
- A visitor copy reaches a Spanish visitor in Spanish; a team email reaches the team in the app's default language; empty translations fall back to the default language's words; apps without localization behave exactly as in 0.2.0.
- A logged-in editor's preview can read a form's newest draft; nobody else ever gets a draft.

**Non-Goals:** a per-output language choice, a `{{locale}}` token, the locale in webhook bodies, per-locale plugin default words, changing the publish tool or command, deprecating old versions (the reviewer's optional step), CommonJS support (0.2.0 was ESM-only by design).

## Research

### Packaging

- **Payload's plugin template** (`templates/plugin/package.json` on `main`, read 9 Nov 2026, https://github.com/payloadcms/payload/blob/main/templates/plugin/package.json) has top-level `exports`/`main`/`types` at `./src/*.ts` and the `./dist/*` versions under `publishConfig`. Its scripts and `engines` use pnpm. Payload's own packages use the same layout, e.g. `packages/plugin-seo/package.json`. Payload releases with pnpm (root `package.json`: `release-ci` runs `pnpm --filter releaser`). The published `@payloadcms/plugin-seo@3.92.1` manifest has `main` `./dist/index.js` and `exports` at `./dist/`, so pnpm's publish applies the swap.
- **npm** (https://docs.npmjs.com/cli/v10/configuring-npm/package-json#publishconfig): `publishConfig` is "a set of config values that will be used at publish-time", and points to the `config` page for what can be overridden (`registry`, `tag`, `access`, `provenance`…). It names no manifest fields. The registry shows the result: 0.1.0 and 0.2.0 kept `./src` paths and also carry the unused `publishConfig` block.
- **pnpm** (https://pnpm.io/package_json#publishconfig) lists `main`, `exports`, `types`/`typings`, `module`, `bin` and others as fields `publishConfig` overrides before packing.
- **Yarn 4**: its manifest docs list `publishConfig.main`, `module`, `bin`, `browser` and `type` (https://yarnpkg.com/configuration/manifest#publishConfig). Its pack plugin also copies `exports` and `imports`, but not `types` (`packages/plugin-pack/sources/index.ts`, `beforeWorkspacePacking`; docs gap tracked in yarnpkg/berry#6243).
- **npm trusted publishing** needs npm CLI 11.5.1 or later (https://docs.npmjs.com/trusted-publishers/). pnpm hands publishing to the npm CLI for OIDC (pnpm/pnpm#9812). 0.2.0's run 42632529954 proved `npm publish` with OIDC on this repo.
- **Node conditions** (https://nodejs.org/api/packages.html, "Conditional exports", "Community Conditions Definitions"): `types` "should always be included first". User conditions such as `development` can be enabled with `--conditions`. Bundlers enable `development` themselves in dev mode, so a `development` target pointing at files not in the tarball would break apps in `next dev`.
- **TypeScript `paths`** are applied before `node_modules` lookup, so `tsconfig.json` keeps mapping the package name to `src/`. Not checked here: whether `paths` also wins over TypeScript's self-name lookup through the package's own `exports` under `moduleResolution: nodenext`. No TypeScript is installed on the planner's host. The scenario "Typecheck and tests run without dist" proves it in the sandbox.
- **Options weighed:**
    - (a) **Top-level `main`/`types`/`exports` at `./dist/`; `publishConfig` keeps only `access`.** The repo's manifest is the one that ships, so a reader, a test and the registry see the same thing. Dev and tests don't use the package's `exports` (Context), and `tsconfig` `paths` keep the typecheck on `src/`. One kind of edit, no new tooling. **Picked.**
    - (b) **A custom export condition** (`"payload-dynamic-forms:source": "./src/index.ts"` first in each export), turned on through vitest `resolve.conditions`, TypeScript `customConditions` and Next's config. The published manifest would then name `src/` files the tarball doesn't hold. That's harmless to apps, but it's the same mismatch this fix removes, and the packed check would need an exception for it. Nothing in this repo imports the package by name at runtime, so the condition buys nothing. Using the `development` name instead would break apps in dev mode (Node conditions above).
    - (c) **Keep the template layout and publish with pnpm or Yarn.** That would mean pnpm next to Yarn 4 and npm 11.5.1+ for OIDC (pnpm/pnpm#9812), or `yarn npm publish`, which doesn't copy `types`. It would also change the publish path that 0.2.0 just proved. And the repo's manifest would still differ from the shipped one, which is how this bug went unseen.
    - (d) **A `prepack` script that rewrites `package.json`** (clean-package style). It edits the working tree during pack and leaves a dirty file if pack fails, for no gain over (a).
- **Kairos's earlier package:** `kairos-design` publishes with `npm publish` too, so (a) matches the publish path Kairos already uses.

### Email words per language

Read in the published `payload@3.92.1` and `@payloadcms/plugin-form-builder@3.92.1` tarballs (unpacked by the planner, 9 Nov 2026):

- **Payload's fallback:** with no `fallbackLocale` argument, a read falls back to the locale's own `fallbackLocale` or else the default locale whenever `localization.fallback` is on (`dist/utilities/sanitizeFallbackLocale.js`), and `fallback` defaults to `true` (`dist/config/sanitize.js` line 119). For `text` and `textarea` fields an empty string counts as missing, not only `null` (`dist/fields/hooks/afterRead/promise.js` lines 56-86). So "empty Spanish subject → English subject" needs no plugin code.
- **`?locale=all`** sets `req.locale` to `all` (`dist/utilities/addLocalesToRequest.js` lines 46-50). The submit endpoint passes `req.locale` straight into its read and into `metadata.locale`, so such a request would read every localized word as a per-locale object and store `all` as the submission's language. An unknown code is already mapped to the default locale there; `all` and `*` are not.
- **Payload's form builder** makes `subject` and `message` `localized` (`dist/collections/Forms/index.js`, the `emails` array) and sends every email of a submission in `req.locale` (`dist/collections/FormSubmissions/hooks/sendEmail.js` lines 6-13), team and visitor alike.
- **WordPress (Gravity Forms Multilingual, WPML)** sends notifications in the recipient's language: the administrator's emails in the administrator's language, a registrant's in the registrant's (changelog 5.2.0 and 5.3.0, 20 Oct and 4 Nov 2026, https://app.wpml.org/download/gravityforms-multilingual?section=changelog; read through search results, the page itself not opened). Resends and background sends use the language of the entry (5.3.0).
- **Options weighed:**
    - (a) **Every email in the submission's language** (the form builder's way). Simplest: only `localized: true`. But the team, whose language is fixed, gets labels, Yes/No and subject in whichever language each visitor used.
    - (b) **Visitor copy in the submission's language, team email in the app's default locale** (the recipient's language, WPML's way). A team email's words are read from the form in the default locale. The team reads one language; the visitor reads theirs. **Picked.**
    - (c) **A language select on each email output** (submission's / default). Covers both, but adds a field every editor must learn for a case no site has asked for. Later, if one does.

### Draft read

- **Payload drafts:** `find` with `draft: true` reads the newest version of each document when the collection has drafts (`dist/collections/operations/find.js` lines 103-138). The Local API takes `user` (with `overrideAccess: false` the collection's access runs for that user) and `disableErrors`, which returns an empty result instead of throwing when access refuses (`dist/collections/operations/local/find.d.ts` lines 29, 148, 157).
- **Payload's website template** reads pages with `draft` and `overrideAccess: draft`, where `draft` comes from Next's draft mode (`templates/website/src/app/(frontend)/[slug]/page.tsx`; recalled, not re-read for this plan). That trusts the caller's draft-mode cookie. The plugin can't see that cookie, and its public endpoint is open to anyone, so it can't trust a `draft` flag on its own.
- **Kairos content model:** draft previews read linked items as drafts. Here the linked items are option-source items (`resolveChoices`).
- **Sites on Payload's form builder** preview a page's form as its draft today (they read the form with `draft`), so moving them to this plugin would lose that without this change.
- **Options weighed:**
    - (a) **`draft: true` honoured only when a user is given and that user's own read (`overrideAccess: false`, `draft: true`) returns the form; else the anonymous published read.** The collection's read access decides, including any app override. **Picked.**
    - (b) **`overrideAccess: draft`** like the website template. On the public endpoint, anyone adding `?draft=true` would get drafts.
    - (c) **A separate preview endpoint with a secret.** More config and a secret to keep, for what Payload's own user and access already decide.

## Decisions

1. **Manifest (packaging option a).** Top level:
    - `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`.
    - `"exports"`: `"."` → `{ "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }` and `"./shared"` → `{ "types": "./dist/exports/shared.d.ts", "import": "./dist/exports/shared.js", "default": "./dist/exports/shared.js" }`.
    - `types` comes first in each entry (Node docs). `"publishConfig": { "access": "public" }` and nothing else. `files` stays `["dist"]`. Field order otherwise unchanged.
2. **Dev and tests stay on `src/`.** No change to `tsconfig.json` `paths`, `vitest.config.js`, test imports or how `dev/` imports the plugin. If `rm -rf dist && yarn typecheck` fails because TypeScript resolves the self-name through `exports` to the missing `dist/`, that is the one case to block on. Report the error. Don't add a condition or a path.
3. **`scripts/check-packed.mjs`, run as `yarn check:packed`.** Plain Node ESM, stdlib only (`node:child_process`, `node:fs`, `node:os`, `node:path`), no new dependency. Steps:
    1. With no argument: `npm pack --json --pack-destination <scratch>`, run in the repo, after `yarn build`. With a `.tgz` path argument, skip packing and use that tarball.
    2. List the tarball's files (`tar -tzf`) and read `package/package.json` from it (`tar -xzf … package/package.json -O`).
    3. Check that `main`, `types` and every string target in `exports` (walked through nested conditions) is a file in the tarball. A target that is missing, under `./src/`, or ending in `.ts` but not `.d.ts` is an error that names the field and the path (`main: ./src/index.ts is not in the tarball`). Print every error, then exit 1.
    4. Make a scratch app with `fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-packed-'))`, which is outside the repo. Its `package.json` is `{ "name": "packed-check", "private": true, "type": "module" }`.
    5. Install with `npm install <tarball> payload@<the devDependency version of payload> typescript@<the devDependency version of typescript> --no-audit --no-fund --ignore-scripts --registry=https://registry.npmjs.org/`, with env `NPM_CONFIG_USERCONFIG` set to an empty file in the scratch dir. In the release job, setup-node's `.npmrc` sends a placeholder auth token, and an empty user config keeps it out of a public install. If importing `payload` fails only because `--ignore-scripts` skipped an install script, drop the flag and say so in the summary.
    6. In the scratch dir, `node --input-type=module -e` imports `payload-dynamic-forms` and `payload-dynamic-forms/shared` by name. It checks `formsPlugin`, `formBlock` and `getPublicForm` on the first, and `evaluateRules`, `buildWhatsAppMessage`, `whatsappUrl`, `interpolate` and `DEFAULT_WORDS` on the second. It also checks that `import.meta.resolve` of each entry ends in `/node_modules/payload-dynamic-forms/dist/index.js` and `/node_modules/payload-dynamic-forms/dist/exports/shared.js`.
    7. Write `check.ts` (`import { formsPlugin } from 'payload-dynamic-forms'`, `import { evaluateRules } from 'payload-dynamic-forms/shared'`, both used) and a `tsconfig.json` (`module`/`moduleResolution` `nodenext`, `strict`, `skipLibCheck`, `noEmit`), then run the scratch app's `tsc -p .`. A missing declaration is an error under `strict` (TS7016), so this proves `types` resolve for both entries.
    8. Remove the scratch dir and the packed `.tgz` it made, also on failure (`finally`). On success, print one line: `ok <file count> files, both entries import, types resolve (<scratch dir>)`.
4. **Negative proof against the real broken release.** `npm pack payload-dynamic-forms@0.2.0 --pack-destination <tmp>` downloads the published 0.2.0 tarball. Then `node scripts/check-packed.mjs <that .tgz>` must exit 1 and name `main`, `types` and `exports` with their `./src/` paths. The builder runs this once, as task 2.1's check. It is not a CI step, because it depends on an old release staying on the registry.
5. **Where the packed check runs.**
    - In `ci.yml` and `release.yml`, as a new step `Packed install check` (`run: yarn check:packed`) right after the existing `Pack check`.
    - In `release.yml` it carries the same `if: steps.release.outputs.publish == 'true'` as the other check steps. It comes before `Publish`, so a failure stops the release before anything reaches npm and leaves no tag.
    - `tests/workflows.test.ts` adds `'yarn check:packed'` to its `CHECKS` list. That makes the CI test and the release order test (every check before publish) require it.
    - The existing dry-run `Pack check` stays as it is (file list only).
6. **Publish stays `npm publish --access public --provenance` from the repo folder,** not `npm publish <checked .tgz>`. Both pack the same built tree, and npm applies no `publishConfig` field to the manifest, so the published manifest equals the checked one. Changing the command would also change the token-free publish path that 0.2.0 proved, and its scenario.
7. **`yarn test` stays offline.** The packed check needs the registry, so it is a script, not a vitest test. The offline guard for the manifest is a unit test on `package.json`: top-level fields at `./dist/`, `publishConfig` equal to `{ access: 'public' }`.
8. **Lint.** `eslint.config.js` lints `.mjs` files through `allowDefaultProject`, which lists root `*.mjs` and `scripts/*.ts`. If `yarn lint` reports `scripts/check-packed.mjs` as not in a project, add `'scripts/*.mjs'` to `allowDefaultProject`. No other lint change.
9. **Localized email words.** In `deliveryField`, `subject` and `body` get `localized: true`; default values stay (`New submission: {{formTitle}}`, `{{*:table}}`). Their admin descriptions say: subject "Visitor copies use the visitor's language; team emails use the default language."; body keeps its token list and adds the same sentence. No other delivery field becomes localized: addresses, field keys, `from`, labels and webhook settings are the same in every language. Apps without localization: Payload ignores `localized`, so their schema and behaviour don't change.
10. **The plugin's locale.** New helper `pluginLocale(payload, value)` in `src/server/forms.ts`: returns `value` when the app has localization and `value` is one of its locale codes, the default locale when the app has localization and `value` is anything else (`all`, `*`, empty, unknown), and `undefined` without localization. Used by the public endpoint, the submit endpoint (the read and `metadata.locale`), resend (the stored locale) and the default-locale read in decision 11. So `?locale=all` reads and stores the default locale.
11. **Which language each email uses.**
    - **Visitor copy:** the submission's locale. Its subject, body, row labels, choice labels and Yes/No come from the form already read in that locale, as today. An empty translation takes the default locale's words through Payload's fallback (Research); with `localization.fallback: false` an empty subject or body uses the built-in `New submission: {{formTitle}}` and `{{*:table}}`, as in 0.2.0.
    - **Team email:** the app's default locale. When the app has localization and the submission's locale isn't the default, `runDeliveries` reads the form once more with `loadFormById(payload, form.id, { locale: <default>, req })` (published document, trusted) the first time a team output is about to run, and uses that read's output with the same id (subject, body) and that form (row labels, choice labels, Yes/No, `{{formTitle}}`). If that read fails or has no output with that id, the email is sent from the submission-locale form instead, never dropped. Answers are the same; only the words change.
    - **Reason for the split:** the team's language is fixed and known (the app's default); the visitor's is not. A team receiving each visitor's language in its labels and subject reads its own notifications in a language it may not read. WPML does the same (Research).
    - **`beforeEmail`** receives `{ answers, form, locale, req }`, where `form` and `locale` are the ones the email was written from (`locale` `undefined` without localization). Additive; apps can pick a per-language email layout.
    - **Resend:** the same rules, with the submission's stored `metadata.locale` (through `pluginLocale`).
    - **Unchanged:** the WhatsApp message stays in the submission's language (the visitor sends it from their own phone). Webhook bodies keep the snapshot as stored (the submission's language). The snapshot stays in the submission's language.
12. **Draft read.** `getPublicForm(payload, slug, { draft?, locale?, req?, user? })`:
    - `user` defaults to `req?.user`. When `draft` is `true` and there is a user, the plugin reads the forms collection with `draft: true`, `overrideAccess: false`, `user`, `disableErrors: true`, `where: { slug: { equals: slug } }`, `limit: 1`, `depth: 0`, in the plugin locale. If that returns the form, it reads the same id trusted with `draft: true` (`findByID`, `overrideAccess: true`) for the settings `buildLoaded` needs, and builds the public form as today, with option-source items read as drafts (`draft: true`, no `_status` filter; still label, value and listed attributes only).
    - Otherwise (no `draft`, no user, or the user's read returns nothing) it is today's anonymous published read. A refused draft read is never an error.
    - `loadPublishedForm` keeps its signature and stays published-only: it is the submit endpoint's read, so a draft is never submitted, stored or sent.
    - The returned `PublicForm` type doesn't change.
    - Site use (README › Rendering): in draft mode, `const { user } = await payload.auth({ headers: await headers() })`, then `getPublicForm(payload, slug, { draft: true, locale, user })`.
13. **Public endpoint.** `GET /api/<forms>/public/:slug?draft=true` calls `getPublicForm` with `draft: true` and the request's `req` (Payload has already authenticated `req.user` from the cookie, JWT or API key). Any request that asks for `draft=true` gets `Cache-Control: private, no-store` on its answer (200 or 404), so a CDN never keeps a draft. Without `draft=true` the answer and headers are as in 0.2.0.
14. **Dev config.** `DevConfigArgs` gains `localization?: false`; with it, `buildDevConfig` leaves `localization` out. Default unchanged (`en`, `es`, fallback on). Used by the "app without localization" scenario only.
15. **Version 0.3.0.** A minor under 0.x: new behaviour (draft read, per-language emails), a schema change for apps with localization, and the packaging fix. A grep of `openspec/specs` for `0.2.0`, `publishConfig`, `dist/`, `published`, `subject` and `locale` found: package-release "Licence and package metadata" (version, `publishConfig`), "Package contents" (exports at `dist/`), "CI on every push" and "Release from main, like kairos-design" (the checks list), "README" (topics); plugin-setup "Package entry points" (`dist/` imported by path); form-submission "Public form read" (published only). All seven are modified. form-model "Access" ("anyone reads published forms", drafts not returned to anonymous) stays true and is not modified. form-delivery "Email delivery" names no language; the new rules are a new requirement there.
16. **README.**
    - Compatibility: one line: use 0.3.0 or later, because 0.1.0 and 0.2.0 were published with entry points at files the package doesn't contain.
    - Development's command block: `yarn build && yarn check:packed` with a short comment (packs, installs outside the repo, imports both entries; needs the npm registry).
    - Releasing: the release also runs the packed install check before publishing.
    - Words: email subject and body are localized; which language each email uses (decision 11) and the fallback.
    - Options table: `beforeEmail` shows `(message, { form, answers, locale, req })`.
    - Rendering: a short paragraph and code lines for the draft read (decision 12, site use) and the endpoint's `?draft=true`.
    - Endpoints table: the public endpoint row mentions `?draft=true` for logged-in users with read access.
    - Migrations: a "0.3.0" paragraph: with localization, `subject` and `body` of the email rows move to the `_locales` table (e.g. `custom_forms_delivery_emails_locales`, and the same in the versions tables); Payload's generated migration changes the schema only, so copy each row's old values into the default locale's rows in that migration, or re-enter them; without localization nothing changes.
    - New `## Changelog` section above Licence, newest first, one line per version from 0.3.0: "0.3.0: importable package (entry points in `dist/`), email subject and body per language (visitor copy in the visitor's language, team email in the default language), draft read for previews. Migration needed with localization (see Migrations)."

## Payload plugins

Not applicable: this is a plugin package, not a site.

## Content model

Words the server writes stay in Payload: subject and body become per-language fields like every other form word, and team emails read the default-language words from the same fields. No word is added in code. The two English strings left in code (the built-in subject used when every locale's subject is empty, and the default `notFound` words when no form is found) are listed as later in the proposal. Draft previews read linked option-source items as drafts (decision 12).

## Risks / Trade-offs

- **The packed check needs the npm registry** and takes some time to install `payload` and `typescript` (not measured; expect under a minute or two on a GitHub runner). A registry outage fails CI and holds the release. That is acceptable: the release itself needs the registry anyway.
- **`payload` imported in plain Node.** The check imports the server entry outside Next. The existing scenario "Built package exposes both entries" already imports `dist/index.js` in plain Node with the repo's own `payload`, so this is expected to work. The planner didn't rerun it for this plan.
- **Old versions stay broken on npm.** Apps pinned to `0.2.0` keep failing until they move to 0.3.0. Deprecating 0.1.0 and 0.2.0 with a message pointing at 0.3.0 is the reviewer's optional step.
- **One more form read per team email batch** when a submission isn't in the default locale (two queries, once per delivery run). Small next to sending an email.
- **Spanish team words are stored but unused.** Subject and body are per-language for every row, so a team row's Spanish subject is never sent; the admin description says so. A starter that machine-translates every localized field will also translate those.
- **Migration data:** the generated migration drops the old columns. No app can have 0.2.0 data (it doesn't import), so the README note is for completeness; not checked on Postgres.
- **Draft read through `disableErrors`:** an app whose read access throws instead of returning `false` would still surface its own error. Not seen in this repo; not checked further.
