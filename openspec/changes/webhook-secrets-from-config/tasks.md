## 1. Options and secret resolution

- [x] 1.1 Add `webhooks` to `FormsPluginOptions` (JSDoc for each key, as the other options have) and `ResolvedOptions`, with defaults `secretsInAdmin: true` and `requireSignature: false` in `src/index.ts` (design 1). In `src/collections/forms.ts`, leave out the webhook row's `signingSecret` and `headers` fields when `secretsInAdmin` is false (design 4). Covers "Fields absent when turned off". Done when tests/plugin-config.test.ts › "secretsInAdmin false leaves the secret fields out" passes and the existing plugin-config tests still pass.
- [x] 1.2 In `src/delivery/run.ts` and `src/delivery/webhook.ts`, resolve the signing secret (admin first, then config, with functions awaited) and the headers in the order of design 3. Unsigned webhooks warn once per webhook per process, and `requireSignature` refuses them (design 5). Keep `sendWebhook` usable on its own as in 0.1.0 by passing resolved values in, not options. Covers "Config secret signs when the admin secret is empty", "Admin secret wins over the config secret", "Secret function per webhook", "Config headers merge under admin headers", "Unsigned send warns once per webhook" and "Signature required". Done when those six tests in tests/webhook.test.ts pass and the three existing webhook tests still pass unchanged.

## 2. Standard Webhooks headers

- [x] 2.1 Add `webhook-id` to every webhook, and `webhook-timestamp` and `webhook-signature` to signed ones (design 6). Add a base64 HMAC helper in `src/security/crypto.ts` that takes raw key bytes (Web Crypto, `btoa`/`atob`, no `node:` imports). Add `standardwebhooks@1.1.1` as an exact-pinned devDependency (design 7). Covers "Reference library verifies a whsec secret", "Plain secret keys with its UTF-8 bytes" and "Id stable across retries, sent unsigned too". Done when those three tests in tests/webhook.test.ts pass, tests/workers-safe.test.ts passes, and `grep -rn standardwebhooks src` prints nothing.
- [x] 2.2 Integration tests on the dev app: create tests/int/webhook-config.int.test.ts, which boots the dev app with `webhooks: { secretsInAdmin: false, signingSecret: 'config-secret-for-tests' }` (follow how the existing int tests boot and stub outbound HTTP), and add the resend test to tests/int/delivery.int.test.ts. Covers "Config secret still signs with the fields gone" and "Resend keeps the id". Done when tests/int/webhook-config.int.test.ts › "config secret signs when admin secret fields are off" and tests/int/delivery.int.test.ts › "resend keeps the webhook-id" pass, and tests/int/access.int.test.ts › "webhook secrets are hidden from non-admins" still passes.

## 3. Release, version and docs

- [x] 3.1 Remove the publish step's `env` block from `.github/workflows/release.yml`. Reword the comments at the top and above Publish so they no longer mention `NPM_TOKEN` (design 8). Rename and rewrite the workflows test to match. Covers "Trusted publishing, token only for the first publish". Done when tests/workflows.test.ts › "release uses trusted publishing with no secrets" passes, the other two release tests pass, and `grep -c NPM_TOKEN .github/workflows/release.yml` prints 0.
- [x] 3.2 Set `version` to `0.2.0` in `package.json` (design 9). In `README.md`:
    - Add a `webhooks` row to the options table.
    - Rewrite "Webhook signature": which secret wins and the header order; the 0.1.0 `X-Form-Signature` verifier (kept as is); a Standard Webhooks section with the `webhook-*` headers, `webhook-id` as an idempotency key, a `standardwebhooks` verify example with a `whsec_` secret, and a one-line way to make one (`'whsec_' + base64 of 32 random bytes`); and `requireSignature` plus the unsigned warning.
    - Add a note that `secretsInAdmin: false` drops the column and the headers table at the app's next migration and loses stored values (design 4).
    - Update the `access.isAdmin` row to recommend config secrets.

    Done when `node -p "require('./package.json').version"` prints `0.2.0`, `grep -cE 'secretsInAdmin|requireSignature|webhook-id|whsec_' README.md` prints 4 or more, and tests/readme.test.ts passes.

## 4. Final checks

- [x] 4.1 Run once, in order: `yarn install --immutable`, `yarn lint` (no errors), `yarn typecheck`, `yarn test`, `yarn build`, the release workflow's pack check (`npm pack --dry-run --json`, only `dist/`, `package.json`, `README.md`, `LICENSE`), and `yarn spec:validate`. Done when each exits 0. Report the test count and the lint warning count (0.1.0 had 46 warnings; no new warnings in touched files).

## Workflow follow-up

- Planner: rerun every CHECK in a throwaway sandbox, match each CHECK's test name against the passing tests, and audit the diff (no secrets, no client names; the repo is public).
- Planner: archive the change, then run `openspec validate --all --strict`.
- Planner, on the reviewer's yes: push to `main`. Release publishes 0.2.0 through trusted publishing and tags `v0.2.0`. Check the registry (0.2.0 latest, provenance) and the tag.
