# Contributing

## Development

Use Node.js 22 for development. The installed library supports Node.js 18.18.1 and newer.

```bash
npm install
```

## Tests And Validation Tools

| Location | Purpose | Command |
| --- | --- | --- |
| `test/**/*.test.ts` | Library unit and regression tests, using Vitest | `npm test` |
| `scripts/release.test.mjs` | Release-script helper tests, using Node's test runner | `npm run test:release-script` |
| `scripts/smoke-exports.mjs` | Built ESM and CommonJS exports | `npm run smoke:exports` |
| `scripts/smoke-installed-package.mjs` and `scripts/fixtures/` | Temporary package installation, runtime imports, and TypeScript declarations | `npm run smoke:install` |
| `scripts/verify-pack-boundary.mjs` | Files included in the npm tarball | `npm run pack:verify` |
| `playground-node/test/` | Browser Playground read-option regressions, using Node's test runner | `npm --prefix playground-node run test:migration` |

`npm test` runs only the library tests. The release-script tests and package checks are separate commands. The smoke and package checks require a successful build first.

## Checks

From the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run test:release-script
npm run build
npm run smoke:exports
npm run smoke:install
npm run pack:verify
```

For Playground changes, also run the checks in the [browser guide](docs/playground.md#checks) and [Node guide](playground-node/README.md#checks).

Set `DIR_TREE_CONSUMER_NODE` to an absolute Node.js 18.18.1 executable path to run installed-package runtime checks at the minimum supported version. Type checks still use the development toolchain. Performance fixtures and commands are in [Reader benchmarks](docs/benchmarks.md).

## Changes

- Keep library functions independent of application UI and state.
- Place behavior in its domain module and document public inputs, outputs, and errors.
- Write comments in English and preserve existing file creation dates.
- Add regression tests for changed behavior and update the relevant API documentation.
- Add public API changes to `CHANGELOG.md`; update package exports when introducing a subpath.

Follow the [release guide](docs/release.md) when publishing.
