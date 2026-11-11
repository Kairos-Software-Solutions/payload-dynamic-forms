## MODIFIED Requirements

### Requirement: Licence and package metadata
The repo SHALL have a LICENSE file with the reviewer's licence (MIT), and `package.json` SHALL carry the same licence, the generic unscoped name `payload-dynamic-forms`, version 0.3.0, `publishConfig` holding only `access: public`, the `payload-dynamic-forms` repository URL, the `payload-plugin` keyword, `payload ^3.92.1` as its only peer dependency, Payload's Node engines (`^22.23.4 || >=24.22.1`) and one exact version for every Payload devDependency.

#### Scenario: Metadata matches
- **WHEN** the test reads `package.json` and `LICENSE`
- **THEN** the licence names agree, the name is `payload-dynamic-forms`, the repository URL is the `payload-dynamic-forms` repo, the peer range is `^3.92.1`, `publishConfig` equals `{ access: 'public' }`, the version is 0.3.0, the engines are `^22.23.4 || >=24.22.1`, and `payload` and every `@payloadcms/*` devDependency except `@payloadcms/eslint-config` have the same exact version
- **CHECK** tests/package.test.ts › "package metadata and licence agree"

## ADDED Requirements

### Requirement: Peer range accepts the current stack
The `payload` peer range SHALL accept the exact Payload version the repo develops and tests against, so apps on that Payload, Next.js 16.4 and React 19.3 can keep the published version. The package SHALL declare no Next.js or React peer, because its runtime code imports only `payload` and `node:buffer`.

#### Scenario: Dev Payload version is inside the peer range
- **WHEN** the test reads `package.json`
- **THEN** the `payload` devDependency is an exact version with the same major as the peer range and not below its floor 3.92.1
- **CHECK** tests/package.test.ts › "peer range accepts the dev payload version"

#### Scenario: Runtime code needs no other peer
- **WHEN** the test reads every runtime import under `src/`
- **THEN** each one is relative, `payload`, a `payload/` subpath or `node:buffer`
- **CHECK** tests/package.test.ts › "src needs no peer besides payload"

#### Scenario: Packed package installs with the dev Payload version
- **WHEN** `yarn build && yarn check:packed` runs with `payload` 3.93.0 as the devDependency
- **THEN** the scratch app installs the tarball with `payload@3.93.0`, and both entries import by name and typecheck
- **CHECK** `yarn build && yarn check:packed` exits 0 and prints `ok <n> files, both entries import, types resolve (<dir>)`

### Requirement: Lockfile clear of the November 2026 advisories
The lockfile SHALL resolve no version below the fix of an advisory listed on 11 November 2026: next 16.4.5, vitest 4.1.11, @vitest/mocker 4.1.12, payload and @payloadcms/next 3.93.0, esbuild 0.25.0, file-type 21.3.2, yaml 2.8.3 (2.x), @eslint/plugin-kit 0.3.4, and no minimatch 9.x or 10.x. deepmerge 4.3.1 stays: no fixed release exists. Transitive fixes SHALL use Yarn `resolutions`.

#### Scenario: Lockfile is clear of the listed versions
- **WHEN** the test reads every resolved entry in `yarn.lock`
- **THEN** none is a listed package below its fixed version, no minimatch is 9.x or 10.x, and deepmerge, if present, is 4.3.1
- **CHECK** tests/dependencies.test.ts › "lockfile has no version from the November 2026 advisories"

#### Scenario: Audit shows only the unfixed advisory
- **WHEN** `yarn npm audit --all --recursive` runs after the install
- **THEN** it reports no advisory for next, vitest, @vitest/mocker, payload, @payloadcms/next, esbuild, file-type, minimatch, yaml or @eslint/plugin-kit; from the list, only deepmerge remains
- **CHECK** `yarn npm audit --all --recursive --json` names none of those ten packages; any other advisory it names is listed in the builder's summary

#### Scenario: drizzle-kit's TypeScript loader runs on the lifted esbuild
- **WHEN** the test loads `@esbuild-kit/core-utils` from where `@esbuild-kit/esm-loader` resolves it and transforms `const a: number = 1` as `a.ts`
- **THEN** the output code is `const a = 1;` and the `esbuild` that core-utils resolves is 0.25.0 or later
- **CHECK** tests/dependencies.test.ts › "esbuild-kit transforms TypeScript on the lifted esbuild"

### Requirement: Development toolchain
The repo SHALL type-check on TypeScript 6 with no deprecated option and no `ignoreDeprecations`, test on Vitest 5 with `vite` listed as a devDependency because Yarn installs no peers, and lint on ESLint 9 with a single `eslint` and a single `typescript` in the lockfile, matching the devDependencies.

#### Scenario: TypeScript 6 without deprecations
- **WHEN** `yarn typecheck` and `yarn build` run on TypeScript 6
- **THEN** both pass, neither tsconfig has `baseUrl` or `ignoreDeprecations`, and the built entry files keep their paths
- **CHECK** `yarn typecheck && yarn build` exits 0; `grep -cE 'baseUrl|ignoreDeprecations' tsconfig.json tsconfig.build.json` prints 0 for both; `ls dist/index.js dist/index.d.ts dist/exports/shared.js dist/exports/shared.d.ts` exits 0

#### Scenario: Vitest 5 with vite declared
- **WHEN** `yarn vitest --version` runs
- **THEN** it reports Vitest 5.1.0, and `package.json` lists `vite` in devDependencies
- **CHECK** `yarn vitest --version` prints a line containing `5.1.0`; `node -p "require('./package.json').devDependencies.vite"` prints `8.3.8`

#### Scenario: One ESLint and one TypeScript
- **WHEN** the test reads `yarn.lock` and `package.json`
- **THEN** every `eslint` entry resolves to the `eslint` devDependency's version and every `typescript` entry (npm and Yarn's compat patch) to the `typescript` devDependency's version
- **CHECK** tests/dependencies.test.ts › "lockfile resolves one eslint and one typescript"

### Requirement: README names the tested Payload version
The README's Compatibility section SHALL name the exact `payload` version the tests run on, next to the peer range, so readers see both.

#### Scenario: Compatibility names the dev Payload version
- **WHEN** the test reads the README and `package.json`
- **THEN** the Compatibility section contains `^3.92.1` and the `payload` devDependency's version
- **CHECK** tests/readme.test.ts › "compatibility names the payload version the tests run on"
