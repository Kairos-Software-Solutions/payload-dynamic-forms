# Design: payload-forms-plugin

## Context

- New, empty repo. The builder scaffolds it from Payload's plugin template and ports the forms engine of the Kairos website (read-only copy in the git-ignored `input/website/src/`: `payload/collections/CustomForms.ts`, `CustomFormSubmissions.ts`, `CustomFormAttachments.ts`, `lib/custom-forms/*`, `lib/interpolateTemplate.ts`, `components/forms/*` for how a renderer uses it). See proposal.md › Why.
- The reviewer's decisions (7 Nov 2026): open source on public npm, no install token anywhere; the package is the plugin only (collections, fields, validation, endpoints, delivery, typed helpers), installed with one call; examples allowed; no visitor UI unless a default renderer is shipped later; don't wrap the official form builder, borrow its config style and `{{*}}`/`{{*:table}}` tokens.
- Apps that will install it run Payload 3.92.1 + Next.js 16 on Cloudflare Workers through OpenNext, with D1 and R2, and send email through an email adapter, so `payload.sendEmail` is the delivery path. The builder tests on SQLite in Node, not on Workers.
- This repo becomes public. Its `openspec/` folder is the work log and is public too: no client names in specs, code, tests, fixtures or docs. Fixtures use neutral data (topics such as "Cameras", example.com addresses, the fictional number +1 555 000 1234).

## Goals / Non-Goals

**Goals:** a 0.1.0 that the next change can install into a site on QA without editing the plugin: every feature of the website engine, the improvements listed in Research, and the one form shape a topic-driven WhatsApp form needs, all proven by tests.

**Non-Goals:** see proposal.md › Out of scope. In particular no React, no admin components, no visitor UI, no Workers runtime tests.

## Research

What was looked at, 7 Nov 2026 (Kairos's research note on Payload forms, plus the sources below):

- **Payload's official form builder** (docs [1], source at v3.92.1 [2]). Flat field list, text-only values, public create endpoint with no server check of required, visibility, email format or options; no show/hide rules (only price conditions on the payment field, still so in 3.93.0 and 4.0 beta), no steps, no captcha, honeypot or rate limit; emails sent in an `afterChange` hook with errors only logged. Good ideas borrowed: the `fields` registry (`true`/`false`/partial block/new block), `overrides.fields({ defaultFields })`, `beforeEmail`, and the `{{field}}`, `{{*}}`, `{{*:table}}` tokens. Picked: replace, not wrap; wrapping keeps the open create endpoint and flat model we'd override anyway.
- **The Kairos website's custom forms** (internal repo, ported here). Ahead of the official plugin: sections, steps with next-step rules and loop checks, one rule engine for browser and server, hidden answers dropped, Turnstile and honeypot on the server, private attachments created by the server, a delivery log, a labelled snapshot. Weak points found by reading the code, each fixed in this change:
    - `{{project-type}}` never fills: `interpolateTemplate` matches `[a-zA-Z0-9]+` while keys are kebab-case → tokens accept dashes, underscores and `.attribute` (form-delivery › Template tokens).
    - Visitor words fixed in the renderer and in server messages → every word in Payload, grouped per question, plus a form wording group (form-model › Words).
    - Server checks only "required" → email, number, date, length and option checks (form-rules › Answer checks).
    - The server checks every visible section even when a step jump skipped it, so a required field in a skipped section blocks sending → only sections on the step path count (form-rules › Steps).
    - The operator list is copied three times → defined once.
    - `{{email}}` allowed in "to" → no tokens in addresses; a visitor copy names an email field and is checked as one address.
    - No rate limit, one file per field, files left behind when the submission write fails, delivery always inside the request, no email retry or resend, `schedulePublish: true` with no job runner (Payload's drafts docs [3]: scheduled jobs never run without one) → each addressed below.
    - IP and user agent kept forever → IP off by default.
- **A client's WhatsApp message form** (internal). Stores nothing; builds a wa.me link in the browser; choices come from a topics collection whose items carry a question set, an opening and a closing line, and an example; `?need=` preselects a topic; all visitor words sit in a wording group. It needs from the plugin: choices from a collection with attributes, rules on those attributes, prefill from a link parameter, per-question row labels, store off, and a WhatsApp delivery whose message template reads the chosen topic's opener and closer. This change proves that shape in tests (form-delivery › WhatsApp link) and does not port the site.
- **@10x-media/form-builder** 0.1.0-beta.27 [4]: Where-shaped `visibleWhen`/`validateWhen`, signed webhooks, KV rate limit, field registry. Beta, one small team, D1 not checked. Picked as a source of ideas only: the HMAC webhook signature and the KV rate limit. Other community form plugins (@humaan wraps the official one, @agentmarketing and @spon are single-author or "not ready for production") were skipped.
- **Payload's plugin template** (docs [5], `create-payload-app` source [6]). `--template plugin` downloads `templates/plugin` from the `3.x` branch. On 7 Nov 2026 that branch pins `payload` 3.93.0 and peers `^3.93.0`; the template uses pnpm, MongoDB memory server, Playwright e2e and sample admin components, and has no GitHub workflow although the docs mention one. `@payloadcms/db-sqlite` is already a devDependency.
- **Payload KV** (source at v3.92.1 [7]): `payload.kv` with get/set/delete/has/keys/clear, no expiry; the default adapter stores in the database. Enough for a soft per-IP counter (read, then write). The Cloudflare Workers rate-limit binding is an alternative: not checked; the option shape leaves room for a custom store later.
- **Delivery after the reply.** Workers keep running `waitUntil` work up to 30 s after the response [8]. Payload jobs would also work but need a runner, and `autoRun` is not for serverless [9]; no Kairos site has a Cron Trigger. Picked: a `delivery.schedule(task)` option so the app passes Next's `after` or `waitUntil`; default runs inline. Whether `after` inside Payload's REST route runs on OpenNext is not checked (first site's QA check).
- **Turnstile** [10]: verify every token on the server; a token lasts 300 s and works once; `idempotency_key` makes retries safe. No Payload Turnstile plugin exists on npm; the website's ~50-line verifier is enough.
- **Workers limits** [8]: 128 MB memory per isolate and files read into memory, so 10 MB per file and 25 MB per submission stay as the website had them.
- **Publishing.** Public npm needs no token to install (unlike GitHub Packages, whose npm registry needs a classic token with `read:packages` outside Actions [11]). npm trusted publishing (OIDC from GitHub Actions, no long-lived token, automatic provenance from a public repo) [12] is configured per package on npmjs.com, so the package must exist first. Picked for 0.1.0: an `NPM_TOKEN` repository secret (the planner adds it after the reviewer's yes), with `--provenance` and `id-token: write` so switching to trusted publishing later only drops the token.
- **Licence.** Payload, its plugins and its plugin template are MIT; the community form plugins checked are MIT. Kairos's other public npm package is marked `UNLICENSED`, so there is no house precedent. Picked: MIT, pending the reviewer's call.

Sources (read 7 Nov 2026):

1. Payload docs, Form Builder plugin: https://payloadcms.com/docs/plugins/form-builder
2. Form builder source at v3.92.1: https://github.com/payloadcms/payload/tree/v3.92.1/packages/plugin-form-builder/src
3. Payload docs, Drafts (scheduled publish needs jobs): https://payloadcms.com/docs/versions/drafts
4. @10x-media/form-builder: https://github.com/10x-media/payload-plugins/tree/main/packages/form-builder
5. Payload docs, Building your own plugin: https://payloadcms.com/docs/plugins/build-your-own
6. create-payload-app templates list and plugin template on `3.x`: https://github.com/payloadcms/payload/blob/3.x/packages/create-payload-app/src/lib/templates.ts , https://github.com/payloadcms/payload/tree/3.x/templates/plugin
7. Payload KV adapter at v3.92.1: https://github.com/payloadcms/payload/blob/v3.92.1/packages/payload/src/kv/index.ts
8. Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
9. Payload docs, Jobs queues: https://payloadcms.com/docs/jobs-queue/queues
10. Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
11. GitHub Packages npm registry: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
12. npm trusted publishing: https://docs.npmjs.com/trusted-publishers/
13. Package facts (versions, peers, licences): https://registry.npmjs.org/payload , https://registry.npmjs.org/@payloadcms/next , https://registry.npmjs.org/create-payload-app

## Decisions

1. **Scaffold, then trim.** Run `npx create-payload-app@latest --template plugin --name kairos-payload-forms --no-deps --no-git --no-agent` in a scratch folder and move its files into the repo root (keep `openspec/`; never touch `input/`). If a flag is refused, drop it and say so in the summary. Remove the template's sample collection, sample field, sample endpoint, `BeforeDashboard*` components, the `./client` and `./rsc` exports, `dev/e2e.spec.ts`, `playwright.config.js`, `@playwright/test`, `mongodb-memory-server`, `@payloadcms/db-mongodb`, `@payloadcms/db-postgres`, `sharp` (no image sizes are needed) and the `.vscode` folder. Record the template's commit or version in the README's "Development" section.
2. **Yarn 4 instead of pnpm.** Kairos repos and the planner's review scripts use Yarn 4 with the `node-modules` linker; consumers can install a published package with any manager. `packageManager: yarn@4.18.1`, `.yarnrc.yml` with `nodeLinker: node-modules`, scripts rewritten from `pnpm x` to `yarn x`, the `pnpm` block removed, `yarn.lock` committed. Scripts: `build`, `clean`, `dev`, `generate:types`, `generate:importmap`, `lint`, `typecheck` (`tsc --noEmit`; adjust the template's `composite`/`emitDeclarationOnly` settings in a separate `tsconfig.build.json` if `--noEmit` conflicts), `test` (`vitest run`), `spec:validate` (`cross-env OPENSPEC_TELEMETRY=0 openspec validate --all --strict`, `@fission-ai/openspec` 1.16.0 pinned).
3. **Versions.** `payload` and every `@payloadcms/*` devDependency exactly 3.92.1 (the floor of the peer range; the template now ships 3.93.0); peer `payload: ^3.92.1` and nothing else (no React or `@payloadcms/ui` peer, as the package ships no components). Keep the template's Next, React, TypeScript and vitest versions unless 3.92.1's peers refuse them (`@payloadcms/next@3.92.1` accepts `next >=16.3.3 <17`).
4. **Dev app on SQLite.** `dev/payload.config.ts` uses `@payloadcms/db-sqlite` with a temp-file database per test run (`push: true`), locales `en` and `es`, a `users` collection, a `topics` collection (label, slug, fieldSet, opener, closer, example; drafts on) as an option source, and an email adapter that records messages in memory for tests. The integration tests start it with `getPayload` and call endpoint handlers through `createPayloadRequest`, as the template's `int.spec.ts` does; outbound `fetch` (Turnstile, webhooks) is stubbed with `vi.stubGlobal`. Tests use their own forms or `cf-connecting-ip` values so the default rate limit never trips a test that isn't about it. The dev Next app stays for manual use; nobody runs it in this change.
5. **Default slugs** `custom-forms`, `custom-form-submissions`, `custom-form-attachments` (the website's), renameable. They don't clash with the official plugin's `forms`/`form-submissions`, so an app can run both while it moves over, and the website keeps its slugs when it is ported. The website's current tables may still need a migration: that is the port change's job.
6. **`enabled` defaults to `true`; `enabled: false` returns the config untouched.** A plugin that does nothing until switched on would surprise every other user; the starter writes `formsPlugin({ enabled: false })`. The template's alternative (keep the schema when off) is not used: a site without forms would carry three empty tables and admin entries. README warns about switching off a site that has data.
7. **Package layout.**
    - `src/index.ts`: `formsPlugin`, `formBlock`, `getPublicForm`, types (`FormsPluginOptions`, `PublicForm`, `SubmitResult`, …).
    - `src/exports/shared.ts` (export `./shared`): rule engine, step path, answer checks, `initialAnswers`, `interpolate`, `buildWhatsAppMessage`, `whatsappUrl`, `OPERATORS`, `DEFAULT_WORDS`, types. Type-only imports from `payload`; nothing else.
    - `src/collections/` (forms, submissions, attachments, field blocks, rule fields built once), `src/endpoints/` (submit, public, resend), `src/delivery/` (store, email, webhook, whatsapp, log), `src/security/` (honeypot, turnstile, rate limit), `src/hooks/` (save checks, resend tick).
    - `examples/minimal-form.tsx`: a React client component using `./shared` and the submit endpoint; typechecked, not shipped.
8. **Options** (all optional; JSDoc on each):
    ```ts
    formsPlugin({
      enabled?: boolean                                  // default true
      slugs?: { forms?: string; submissions?: string; attachments?: string }
      fields?: Record<string, boolean | Partial<Block> | FieldTypeDefinition>
      optionSources?: Record<string, { collection: CollectionSlug; labelField: string; valueField: string; attributes?: string[] }>
      words?: Partial<FormWords>                         // defaults for new forms
      attachments?: false | { collection?: CollectionSlug; maxFileSize?: number; maxTotalSize?: number; mimeTypes?: string[] }
      turnstile?: { enabled?: boolean; secretKey?: string; fieldName?: string }   // fieldName default 'cf-turnstile-response'
      honeypotField?: string                             // default '_hp'
      rateLimit?: false | { max?: number; windowSeconds?: number }                // default 5 per 600 s
      whatsapp?: { number?: (args: { req: PayloadRequest; form: PublicForm }) => string | undefined | Promise<string | undefined> }
      delivery?: { schedule?: (task: () => Promise<void>) => void }
      beforeEmail?: (message: SendEmailOptions, ctx: { form; answers; req }) => SendEmailOptions | Promise<SendEmailOptions>
      access?: { isAdmin?: (req: PayloadRequest) => boolean }                     // default: any logged-in user
      metadata?: { ip?: boolean; userAgent?: boolean }                            // default ip false, userAgent true
      formOverrides?, submissionOverrides?, attachmentOverrides?                   // collection config + fields({ defaultFields })
    })
    ```
9. **Endpoints** (collection endpoints, so renamed slugs follow): `POST /api/<forms>/submit/:slug`, `GET /api/<forms>/public/:slug`, `POST /api/<submissions>/:id/resend`. Submit responses: `{ ok: true, message, redirectURL?, submissionId?, whatsappUrl? }` or `{ ok: false, message, fieldErrors? }` with status 400/404/409/429/500. Keys are kebab-case, so `_hp` and `cf-turnstile-response` can't clash with a normalised key except `cf-turnstile-response` itself, which the save check reserves.
10. **Field words.** Each input block has a collapsible "Words" group: `label` (required), `hint`, `placeholder`, `errorEmpty`, `errorInvalid`, `rowLabel` (falls back to `label`). The form has a "Form wording" group, defaults from `DEFAULT_WORDS` merged with `options.words`, applied as field `defaultValue`s: `send`, `sending`, `sent`, `continue`, `back`, `chooseOne`, `stepProgress` (`Step {{current}} of {{total}}`), `optionalHint`, `errorPrefix`, `closed`, `success`, `notFound`, `required` (`{{label}} is required.`), `invalid`, `fileRejected`, `tooManyTries`, `securityCheckFailed`, `genericError`, `yes`, `no` (decision 18). Field errors use the field's words first, then the form's template with `{{label}}`. Every word field is `localized: true` (ignored by apps without localisation). `getPublicForm` fills any empty word from the defaults so older forms still render.
11. **Choice fields and sources.** Select, radio and checkbox-group blocks have `optionsFrom` (`typed` or a source key). Typed: an `options` array (label, value; label localized). Source: one sortable `hasMany` relationship to all source collections (polymorphic, filtered to the picked source), empty = all published items in the source's default sort. `getPublicForm` and the submit endpoint resolve choices to `{ label, value, attributes }` at depth 0, skipping unpublished and missing items. Rules read `<key>.<attribute>` from the chosen option; tokens read the same.
12. **Server flow of submit:** find published form (Local API, `overrideAccess: false` for the read, as the visitor) → closed? → if the form stores or sends: honeypot, Turnstile, rate limit → parse multipart or JSON → normalise → step path → drop hidden → answer checks (built-in and registry `validate`) → files checked (count, MIME, size, total) → if store: create attachments, create submission (status received), link files; on failure delete created files → WhatsApp URL if on → email/webhook delivery inline or via `schedule` → update status and log → respond. Everything after the response must catch its own errors and log them.
13. **Rate limit key** `forms:rl:<form id>:<sha256(ip + PAYLOAD_SECRET)>` holding `{ start, count }` in `payload.kv`; a stale window is overwritten. One entry per visitor per form remains; the README says so. Web Crypto (`crypto.subtle`) for hashing and HMAC, never `node:crypto`.
14. **Webhook signature** `X-Form-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, documented in the README with a verify snippet. Retries pause 0.5 s, 1 s, 2 s; with the 8 s default timeout and 3 retries a single webhook can exceed the 30 s `waitUntil` window, so the README advises short timeouts on Workers.
15. **Resend.** Endpoint and a sidebar checkbox `resendFailed` on submissions; a `beforeChange` hook runs the failed outputs (through `schedule` when set) and saves the box as false. Outputs are matched by their array row id; an output removed from the form since is skipped with a log entry. No custom admin component: the package stays UI-free and closer to Payload 4.
16. **Not carried over from the website:** the Sharing tab and its public URL (the app owns its routes), live preview config (the app adds it with `formOverrides`), `publishedAt`, schedule publish, the website's role helpers (replaced by `access.isAdmin`), the react-email wrapper (apps use `beforeEmail`).

17. **Name and release** (reviewer, 7 Nov 2026: "let it be generic, like dynamic payload forms"; "publish it to NPM the same way kairos-design is done"). The first build used `@kairos-software-solutions/payload-forms`, repo `kairos-payload-forms`, and a tag-only `publish.yml` with an `npm` environment and a stored token (decision 6.3's tasks). Fix round 1 changes it:
    - Package `payload-dynamic-forms`, unscoped (free on npm, 7 Nov 2026), repo `Kairos-Software-Solutions/payload-dynamic-forms`, public. The exported names (`formsPlugin`, the `./shared` entry) and the default slugs stay.
    - `release.yml` follows `kairos-design`'s `publish.yml` (on push to `main` and `v*.*.*` tags, `contents: write` + `id-token: write`, Node 24, skip when the version's tag exists, checks, publish, tag), with two differences: the tag is created after a successful publish (kairos-design tags first, so a failed publish is skipped on the rerun), and the publish step gets `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN` for the bootstrap. npm can't configure trusted publishing for a package that doesn't exist yet [npm docs, Trusted publishing; npm-trust "Package must exist"], so 0.1.0 goes out with a short-lived token; the reviewer then adds the trusted publisher on npmjs.com and the token is deleted.
    - CI (`ci.yml`) stays on Node 22, the lowest Node the package supports.
18. **Yes and No are words.** `answerToText` turned checkbox answers into a fixed English "Yes"/"No" (first build's summary). Every word a visitor or the team reads comes from Payload (content model rule), so the form wording gets `yes` and `no`, and `answerToText` takes the form's words.

## Payload plugins

- `@payloadcms/plugin-form-builder`: weighed and not used or wrapped (Research). Its config style and tokens are borrowed. Default slugs differ, so both can run in one app.
- `@payloadcms/plugin-import-export`: the natural CSV export for submissions in sync mode (`disableJobsQueue: true`); not a dependency. README shows how an app adds it for the submissions slug. Not tested here.
- Storage (`@payloadcms/storage-r2` on Kairos sites): not a dependency. The attachments collection is a normal upload collection the app maps in its storage plugin, listed after `formsPlugin` so the collection exists when the storage plugin runs (README).
- SEO, redirects, search, MCP, nested docs, ecommerce, Stripe, multi-tenant, Sentry, admin bar, email adapters: not relevant to a forms package; the app's email adapter is used through `payload.sendEmail`.

## Content model

- Words visitors read come from Payload: field labels, hints, errors, row labels and the form wording group. `DEFAULT_WORDS` in code are only the starting values of those fields (the same pattern as a wording group with defaults), and `getPublicForm` uses them only for empty fields.
- Choices come from Payload: typed options or items of a source collection picked in a sortable relationship, "all, sorted" when the pick is empty.
- Collections hold facts. The form is the editor's document; submissions and attachments are records. No display-order or "featured" fields.
- Placing a form on a page is a block that picks the form (`formBlock`), not a fixed route; one block for every form.

## Risks / Trade-offs

- [Tests run on SQLite in Node, not D1 on Workers] → the shared and runtime code bans Node built-ins by test; Web Crypto only; the first site that installs it proves it on QA before any client relies on it.
- [`after`/`waitUntil` inside Payload's REST route on OpenNext not checked] → inline delivery is the default; `schedule` is opt-in and tested with a fake scheduler.
- [Soft rate limit (read then write) on a DB-backed KV, one row per visitor per form] → good enough against casual repeats with Turnstile in front; documented; a custom store can come later.
- [Postgres apps: long enum and table names from nested arrays and blocks] → set short `dbName`/`enumName` on nested selects as the website did; only SQLite is tested; README says Postgres is not tested.
- [The 3.x template moves on (it pinned 3.93.0 on 6 Nov)] → versions pinned to 3.92.1 in this change; the template commit is recorded.
- [95 scenarios is a large first job] → much of the engine is a port with its logic already written; the tests are small and mostly unit tests.
- [Public `openspec/` and tests] → client-neutral fixtures (Context).

## Migration Plan

- None in this change: no app installs it. Each app that adopts it runs `payload migrate:create` for the plugin's collections. Moving the Kairos website (existing `custom-forms` data) and the client WhatsApp form are separate changes with their own plans.
- Rollback: nothing is published until the reviewer's yes; after a publish, `npm deprecate` and a patch release.
