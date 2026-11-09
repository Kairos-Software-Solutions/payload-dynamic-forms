## Why

In 0.1.0 a webhook's signing secret and secret headers can only be typed into the form in the admin. They are then stored as plain text in the app's database, so they also end up in every database backup and export. Any user who passes `access.isAdmin` can read them, and by default that is any logged-in user. Payload's own plugins take secrets from the plugin config, usually from an env var: the Stripe plugin's `stripeWebhooksEndpointSecret` is an example. The plugin should let an app do the same.

Receivers also have no stable message id. They can't recognise a retry or a resend of a delivery they already handled. And they can't use a ready-made verifier, because `X-Form-Signature` is this plugin's own format.

## What Changes

- New plugin option `webhooks`:
    - `signingSecret` (a string, or a function of form, webhook and request) signs any webhook whose admin secret is empty.
    - `headers` (an object, or a function) adds request headers under the webhook's own secret headers.
    - `secretsInAdmin: false` leaves the signing secret and secret header fields out of the forms collection, so secrets come only from config.
    - `requireSignature: true` refuses to send a webhook that has no signing secret and logs the delivery as failed.
- A webhook sent without a signature writes one warning line per webhook per server process.
- Signed webhooks also carry the Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), next to the unchanged `X-Form-Signature`. `webhook-id` goes on every webhook, signed or not. It stays the same across retries and resends of one submission's delivery.
- The release workflow publishes through npm trusted publishing only. The first-publish `NPM_TOKEN` line is removed because the trusted publisher is now set up on npmjs.com.
- Version 0.2.0. README: the new options, which secret wins, verifying with the Standard Webhooks library, and what turning admin secrets off does to an app's database.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `form-delivery`: webhook secrets and headers from config, admin secret fields optional, unsigned-webhook warning and refusal, Standard Webhooks headers.
- `package-release`: release publishes without an npm token.

## Impact

- `src/types.ts`, `src/index.ts` (option defaults), `src/collections/forms.ts` (fields left out when `secretsInAdmin: false`), `src/delivery/webhook.ts`, `src/delivery/run.ts`, `src/security/crypto.ts`, `README.md`, `.github/workflows/release.yml`, `package.json` (version and one devDependency), tests.
- Apps on 0.1.0 see no change in behaviour or database schema unless they set the new options. The only addition they see is the Standard Webhooks headers on webhooks that are already signed, plus a `webhook-id` header on every webhook.
- An app that sets `secretsInAdmin: false` changes its schema: the forms collection loses the signing-secret column and the secret-headers table. Its next Payload migration drops them, and any secrets stored there are lost.

## Out of scope

- Secret rotation (signing with an old and a new secret at once). The Standard Webhooks header allows several signatures, so it can come later.
- Asymmetric (ed25519, `v1a`) signatures.
- Changing the `access.isAdmin` default. That would be a breaking change, so the README recommends config secrets instead.
- Encrypting secrets stored in the database.
- Publishing 0.2.0. The planner pushes to `main`, which publishes, after review and the reviewer's yes.
