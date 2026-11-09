## MODIFIED Requirements

### Requirement: Webhook delivery
Webhook outputs SHALL send JSON (full: form, submission id, snapshot, attachments, answers; or answers only) by POST, PUT or PATCH with their secret headers, an optional `X-Form-Signature` HMAC-SHA256 over timestamp and body using a secret from the admin-only field or the plugin config, a timeout (default 8 s) and up to 3 retries with a growing pause. A non-2xx answer or timeout SHALL count as a failed try.

#### Scenario: Signed request with secret headers
- **WHEN** a webhook with a secret header and a signing secret is delivered
- **THEN** the request has the header, and `X-Form-Signature: t=<unix seconds>,v1=<hex>` where hex is HMAC-SHA256 of `<t>.<body>` with the secret
- **CHECK** tests/webhook.test.ts › "request carries secret headers and a valid signature"

#### Scenario: Retries then gives up
- **WHEN** the endpoint answers 500 twice then 200, with retries 2; and another answers 500 three times with retries 2
- **THEN** the first is logged as one successful delivery after three tries; the second as failed with the last status in its error
- **CHECK** tests/webhook.test.ts › "retries until success or the limit"

#### Scenario: Timeout counts as a failure
- **WHEN** the endpoint does not answer within the timeout
- **THEN** the try is aborted and counted as failed
- **CHECK** tests/webhook.test.ts › "timeout aborts and counts as failed"

## ADDED Requirements

### Requirement: Webhook secrets from the plugin config
The plugin SHALL take `webhooks.signingSecret` and `webhooks.headers`, each a value or a function of `{ form, req, webhook: { id, label, url } }` that may be async. A webhook's non-empty admin signing secret SHALL win over the config secret. Headers SHALL apply in order Content-Type, config headers, admin secret headers, signature headers, a later one replacing an earlier one of the same name regardless of case.

#### Scenario: Config secret signs when the admin secret is empty
- **WHEN** a webhook with no admin signing secret is delivered and `webhooks.signingSecret` is the string `config-secret-for-tests`
- **THEN** `X-Form-Signature` verifies with `config-secret-for-tests`
- **CHECK** tests/webhook.test.ts › "config secret signs a webhook with no admin secret"

#### Scenario: Admin secret wins over the config secret
- **WHEN** a webhook has the admin signing secret `admin-secret-for-tests` and `webhooks.signingSecret` is `config-secret-for-tests`
- **THEN** `X-Form-Signature` verifies with `admin-secret-for-tests` and not with the config secret
- **CHECK** tests/webhook.test.ts › "admin secret wins over the config secret"

#### Scenario: Secret function per webhook
- **WHEN** `webhooks.signingSecret` is an async function returning a secret chosen by `webhook.label`, and a form has two webhooks with different labels
- **THEN** the function receives the form, the request and each webhook's id, label and URL, and each request verifies with its own secret
- **CHECK** tests/webhook.test.ts › "secret function picks a secret per webhook"

#### Scenario: Config headers merge under admin headers
- **WHEN** `webhooks.headers` returns `{ "X-Api-Key": "from-config", "X-Extra": "1" }`, the webhook's admin headers hold `x-api-key: from-admin`, and both try to set `X-Form-Signature`
- **THEN** the request has `x-api-key: from-admin`, `x-extra: 1`, `content-type: application/json`, and the real signature in `X-Form-Signature`
- **CHECK** tests/webhook.test.ts › "config headers merge under admin headers and never replace the signature"

### Requirement: Secret fields can be left out of the admin
With `webhooks.secretsInAdmin: false` the forms collection's webhook rows SHALL have no `signingSecret` field and no `headers` array, so no secret is stored in the database; config secrets and headers SHALL still apply. The default `true` SHALL keep both admin-only fields as in 0.1.0.

#### Scenario: Fields absent when turned off
- **WHEN** the plugin config is built with `webhooks: { secretsInAdmin: false }`, and again with no `webhooks` option
- **THEN** the first forms collection's webhook row fields contain neither `signingSecret` nor `headers`; the second contains both with admin-only access
- **CHECK** tests/plugin-config.test.ts › "secretsInAdmin false leaves the secret fields out"

#### Scenario: Config secret still signs with the fields gone
- **WHEN** the dev app runs with `webhooks: { secretsInAdmin: false, signingSecret: 'config-secret-for-tests' }` and a form with a webhook is submitted
- **THEN** the stubbed endpoint receives a request whose `X-Form-Signature` verifies with the config secret, and the stored form has no `signingSecret` or `headers` key for an admin
- **CHECK** tests/int/webhook-config.int.test.ts › "config secret signs when admin secret fields are off"

### Requirement: Unsigned webhooks
A webhook with no signing secret from either source SHALL be sent unsigned with one `payload.logger.warn` line per webhook per server process naming the form slug and webhook label. With `webhooks.requireSignature: true` it SHALL NOT be sent: its log entry SHALL be failed with 0 tries and the error `Webhook not sent: no signing secret.`

#### Scenario: Unsigned send warns once per webhook
- **WHEN** the same unsigned webhook is delivered three times in one process, and a second unsigned webhook once
- **THEN** all four requests are sent without `X-Form-Signature`, and the logger's `warn` was called exactly twice, each line naming its form slug and webhook label
- **CHECK** tests/webhook.test.ts › "unsigned webhook warns once per webhook"

#### Scenario: Signature required
- **WHEN** `webhooks.requireSignature` is true and a webhook with no secret from either source is delivered, next to a signed one
- **THEN** no request reaches the unsigned webhook's URL, its log entry is failed with tries 0 and error `Webhook not sent: no signing secret.`, and the signed one is sent
- **CHECK** tests/webhook.test.ts › "requireSignature refuses an unsigned webhook"

### Requirement: Standard Webhooks headers
Every webhook SHALL carry `webhook-id`: `msg_<submissionId>_<outputId>` when stored, else `msg_` plus a random id made once per delivery, with characters outside `[A-Za-z0-9_]` replaced by `_`. Signed webhooks SHALL also carry `webhook-timestamp` and `webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<t>.<body>">`, keyed by the decoded bytes of a `whsec_` secret, else its UTF-8 bytes. `X-Form-Signature` SHALL stay unchanged.

#### Scenario: Reference library verifies a whsec secret
- **WHEN** a webhook signed with a `whsec_` secret of 32 random bytes is delivered
- **THEN** `new Webhook(secret).verify(rawBody, headers)` from the `standardwebhooks` package accepts the request, `webhook-timestamp` equals the `t` in `X-Form-Signature`, and `X-Form-Signature` still verifies with the whole secret string
- **CHECK** tests/webhook.test.ts › "standard webhooks library verifies a whsec secret"

#### Scenario: Plain secret keys with its UTF-8 bytes
- **WHEN** a webhook signed with the secret `plain-secret-for-tests` is delivered
- **THEN** `webhook-signature` equals `v1,` plus base64 HMAC-SHA256 of `<webhook-id>.<webhook-timestamp>.<body>` keyed by the secret's UTF-8 bytes
- **CHECK** tests/webhook.test.ts › "plain secret signs standard webhooks with its utf-8 bytes"

#### Scenario: Id stable across retries, sent unsigned too
- **WHEN** a stored submission's webhook fails twice then succeeds with retries 2, and an unsigned webhook on a form that does not store is delivered
- **THEN** all three tries carry the same `webhook-id` `msg_<submissionId>_<outputId>` with fresh timestamps; the unsigned request carries a `webhook-id` matching `^msg_[A-Za-z0-9_]+$` and no `webhook-timestamp` or `webhook-signature`
- **CHECK** tests/webhook.test.ts › "webhook-id is stable across retries and sent without a secret"

#### Scenario: Resend keeps the id
- **WHEN** an admin resends a stored submission whose webhook failed
- **THEN** the resent request's `webhook-id` equals the one the failed delivery sent
- **CHECK** tests/int/delivery.int.test.ts › "resend keeps the webhook-id"
