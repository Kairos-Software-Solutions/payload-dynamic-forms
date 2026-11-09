## Context

0.1.0 signs a webhook only when its admin field `signingSecret` is set. The signature is `X-Form-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, with the secret's UTF-8 bytes as the key, re-signed on each try (`src/delivery/webhook.ts`). This is the same construction Stripe uses, and it can't be forged without the secret. The weak points are where the secret lives and what a receiver can do with the request. Secrets are stored in plain text in the forms collection and readable by `access.isAdmin` (default: any logged-in user). There is no message id, so a receiver can't tell a retry or resend from a new submission.

## Goals / Non-Goals

**Goals:** secrets can stay in env/config and out of the database. An app can make signing mandatory. Receivers get a stable id and can verify with an off-the-shelf library. 0.1.0 apps keep working unchanged.

**Non-Goals:** rotation, asymmetric signatures, encrypting stored secrets, and changing `isAdmin`'s default (see proposal, Out of scope).

## Research

- **What 0.1.0 does:** read in `src/delivery/webhook.ts` and `src/collections/forms.ts`, as described in Context.
- **Payload's own plugins** take secrets from the plugin config, typically from `process.env`. For example, `@payloadcms/plugin-stripe` takes `stripeSecretKey` and `stripeWebhooksEndpointSecret` (https://payloadcms.com/docs/plugins/stripe). Payload's form-builder has no webhooks to compare with.
- **Standard Webhooks 1.0.0** (https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md):
    - Headers are `webhook-id`, `webhook-timestamp` (unix seconds) and `webhook-signature`.
    - The header holds a space-separated list of `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`.
    - The secret is shown as `whsec_<base64 of 24–64 random bytes>`. The HMAC key is the decoded bytes.
    - The id stays the same across retries and is the receiver's idempotency key. Ids and timestamps must not contain `.`.
    - The spec says to add these headers next to existing legacy headers when migrating, which is what this change does.
    - The reference verifier is npm `standardwebhooks` (1.1.1, MIT, two small dependencies).
- **Options weighed:**
    - (a) Config secret only, keeping the 0.1.0 header. Smallest change, but no id and no library.
    - (b) (a) plus the Standard Webhooks headers next to `X-Form-Signature`. Picked: it adds the id and interop, and breaks no 0.1.0 receiver.
    - (c) Replace `X-Form-Signature` with Standard Webhooks only. Breaks 0.1.0 receivers.

## Decisions

1. **Option shape.** `webhooks?: { signingSecret?, headers?, secretsInAdmin?, requireSignature? }` on `FormsPluginOptions`.
    - `signingSecret` and `headers` each take a value or a function `(args: { form: PublicForm; req: PayloadRequest; webhook: { id: string | null; label: string | null; url: string } }) => value | undefined | Promise<…>`.
    - `ResolvedOptions.webhooks` holds `{ headers?, requireSignature: boolean, secretsInAdmin: boolean, signingSecret? }`.
    - Defaults are `secretsInAdmin: true` and `requireSignature: false`, which is 0.1.0 behaviour.
    - The function form lets an app give each endpoint its own secret (Standard Webhooks recommends one secret per endpoint), for example keyed by the webhook's label.
2. **Which secret wins.** The webhook's admin `signingSecret`, when non-empty after trimming, wins over the config one, because it is the more specific setting. The config value is the fallback. An empty string or `undefined` from either counts as "no secret".
3. **Headers.** Request headers are built in this order, later ones replacing earlier ones whose name matches case-insensitively: `Content-Type: application/json`, then config `headers`, then the webhook's admin secret headers, then the signature headers. The signature headers always come last, so neither config nor admin headers can override `X-Form-Signature` or the `webhook-*` headers.
4. **`secretsInAdmin: false`.** The forms collection's webhook rows get no `signingSecret` field and no `headers` array. These are left out of the config, not hidden. A hidden field would still store values, which is the thing this option exists to prevent. The README says this drops the column and the headers table at the app's next migration, and that existing values are lost.
5. **Unsigned webhooks.** When a webhook has no secret from either source:
    - With `requireSignature: false`: it is sent unsigned, and `payload.logger.warn` writes one line per webhook per server process, naming the form slug and webhook label: `payload-dynamic-forms: webhook "<label>" on form "<slug>" is sent unsigned; set a signing secret.` The line is keyed by form id plus output id in a module-level `Set`. This is not one line per submission, so an endpoint that is unsigned on purpose doesn't flood the log.
    - With `requireSignature: true`: no request is made. The log entry is `result: failed`, `tries: 0`, `error: 'Webhook not sent: no signing secret.'`. Status and resend follow the existing rules.
6. **Standard Webhooks headers.**
    - `webhook-id` goes on every webhook, signed or not. It is `msg_<submissionId>_<outputId>` when the submission is stored and both ids exist. Otherwise it is `msg_` plus a `crypto.randomUUID()` with its dashes removed, generated once per delivery. Characters other than `[A-Za-z0-9_]` are replaced by `_`, so it never holds a `.`. It is the same on every try of one delivery and on every resend of a stored submission.
    - When signed, each try adds `webhook-timestamp: <t>` and `webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<t>.<body>">`. `<t>` is the same value as in that try's `X-Form-Signature`.
    - The HMAC key is the base64-decoded bytes after the prefix when the secret starts with `whsec_`, and the secret's UTF-8 bytes otherwise.
    - `X-Form-Signature` is unchanged: it always uses the whole secret string's UTF-8 bytes, so 0.1.0 receivers keep verifying.
    - The README tells receivers who want the `standardwebhooks` library to use a `whsec_` secret, and shows how to make one.
    - Runtime code stays Web Crypto plus `btoa`/`atob` (Workers-safe; `tests/workers-safe.test.ts` already guards this).
7. **`standardwebhooks` as a devDependency, exact pin `1.1.1`.** It is only used by the tests, which prove interop by verifying a request with the reference library. It is never imported by `src/`, so it doesn't ship.
8. **Release without a token.** Trusted publishing is configured on npmjs.com and the `NPM_TOKEN` secret has been deleted, so the publish step loses its `env` block and `release.yml` uses no secrets at all. The 0.2.0 release is then the first real proof of OIDC publishing. If it fails, no tag is created and the workflow can be rerun (existing behaviour).
9. **Version 0.2.0.** These are new options, so it's a minor bump under 0.x. Nothing is removed. The package-release requirement "Licence and package metadata" names the version, so it is modified to 0.2.0 too (plan r1: the first plan missed it; the builder found it and updated `tests/package.test.ts` under task 3.2).

## Payload plugins

Not applicable: this is a plugin package, not a site.

## Content model

Not applicable: no visitor-facing words change. The warning and the `requireSignature` error are server log and admin delivery-log text, written in English like 0.1.0's other delivery-log errors.

## Risks / Trade-offs

- **Some receivers may react to the new headers.** A receiver that rejects requests carrying unknown headers would start failing. This is unlikely, and the release notes in the README name the new headers.
- **Database secrets still win over config.** An app that sets a config secret but leaves an old admin secret in place keeps signing with the admin one. The README says so, and `secretsInAdmin: false` removes the ambiguity.
- **The warning is once per process.** Workers isolates restart often, so it repeats now and then. That's intended: it stays visible without flooding.
