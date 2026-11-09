## 1. Manifest

- [ ] 1.1 In `package.json`, set the top-level `main`, `types` and `exports` to the `./dist/` paths of design 1, with `types` first in each export entry. Reduce `publishConfig` to `{ "access": "public" }` and set `version` to `0.2.1` (design 9). Keep `files`, `engines`, scripts and field order otherwise. In `tests/package.test.ts`, update "package metadata and licence agree" to version 0.2.1 and `publishConfig` equal to `{ access: 'public' }`, and move its export assertions into a new test, "entry fields point at dist and publishConfig holds only access". Covers "Metadata matches", "Entry fields point at dist" and "Typecheck and tests run without dist". Done when both tests in tests/package.test.ts pass, and `rm -rf dist && yarn typecheck && yarn vitest run tests/plugin-config.test.ts tests/int/boot.int.test.ts` exits 0. If the typecheck fails because TypeScript resolves the package name to the missing `dist/`, block with the error (design 2).

## 2. Packed install check

- [ ] 2.1 Write `scripts/check-packed.mjs` as in design 3 (stdlib only, scratch app under `os.tmpdir()`, empty `NPM_CONFIG_USERCONFIG`, `payload` and `typescript` at their devDependency versions, cleanup in `finally`). Add the script `"check:packed": "node scripts/check-packed.mjs"` to `package.json`. If `yarn lint` reports the file as outside a project, add `'scripts/*.mjs'` to `allowDefaultProject` in `eslint.config.js` (design 8). Covers "Built package installs and imports by name", "Published 0.2.0 is refused" and "Built package exposes both entries". Done when:
    - `yarn build && yarn check:packed` exits 0 and prints the `ok … (<dir>)` line, and `test -e <dir>` fails afterwards.
    - `npm pack payload-dynamic-forms@0.2.0 --pack-destination "$TMPDIR"` and then `node scripts/check-packed.mjs "$TMPDIR/payload-dynamic-forms-0.2.0.tgz"` exit 1 with output containing `main: ./src/index.ts`, `types: ./src/index.ts` and `./src/exports/shared.ts` (design 4). Put the output in your summary.
    - `yarn lint scripts/check-packed.mjs` shows no errors.
- [ ] 2.2 Add a `Packed install check` step (`run: yarn check:packed`) right after `Pack check` in `.github/workflows/ci.yml`, and in `.github/workflows/release.yml` with `if: steps.release.outputs.publish == 'true'` (design 5). Add `'yarn check:packed'` to `CHECKS` in `tests/workflows.test.ts`. Covers "CI runs every check" and "New version from main is published, a tagged one is skipped". Done when all four tests in tests/workflows.test.ts pass, including "release uses trusted publishing with no secrets" and "only release.yml publishes" unchanged, and `grep -c 'yarn check:packed' .github/workflows/ci.yml .github/workflows/release.yml` prints 1 for each.

## 3. Docs

- [ ] 3.1 In `README.md`, add the Compatibility line, the Development command line and the Releasing sentence of design 10, and nothing else. Done when `grep -c 'check:packed' README.md` prints 2 or more, `grep -n '0.2.1' README.md` shows the Compatibility line, and tests/readme.test.ts passes.

## 4. Final checks

- [ ] 4.1 Run once, in order: `yarn install --immutable`, `yarn lint` (no errors; 0.2.0 had 46 warnings, and touched files get no new ones), `yarn typecheck`, `yarn test`, `yarn build`, the pack check (`npm pack --dry-run --json`: only `dist/`, `package.json`, `README.md`, `LICENSE`), `yarn check:packed` and `yarn spec:validate`. Done when each exits 0. Report the test count, the lint warning count, the packed file count and how long `yarn check:packed` took.

## Workflow follow-up

- Planner: review rerun in a throwaway sandbox: every CHECK, the CHECK names against the passing tests, `yarn check:packed` and the 0.2.0 negative run. Audit the diff (no secrets, no client names; the repo is public; no `src/` change).
- Planner: archive the change, `openspec validate --all --strict`, `grep -l 'TBD - created by archiving' openspec/specs/*/spec.md` prints nothing. Commit.
- Planner, only on the reviewer's own yes at the push: push to `main`. Release runs the checks including `yarn check:packed`, publishes 0.2.1 through trusted publishing and tags `v0.2.1`. Watch the run.
- Planner: registry check per npm-package-release § 2 step 4: `dist-tags.latest` is 0.2.1, licence, `dist.fileCount`, provenance attestations, tag `v0.2.1`, and `main`, `types` and every `exports` target of the 0.2.1 manifest are files in `curl -sL <dist.tarball> | tar -tz`. Then `node scripts/check-packed.mjs` on the downloaded 0.2.1 tarball, run from a sandbox, not this host.
- Planner: the starter change `dynamic-forms` (job-043) pins `payload-dynamic-forms` 0.2.1.
- Reviewer, optional: deprecate 0.1.0 and 0.2.0 on npm with a message pointing at 0.2.1 (needs his npm login).
