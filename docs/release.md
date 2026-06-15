# Release Checklist

Use this checklist before publishing `@devmc12/dir-tree` to npm.

The root package is the only published artifact. `playground/`, `docs/`, `src/`, `test/`, local scripts, and Vite React UI source must stay in the GitHub repository but out of the npm tarball.

Publishing is automated by `.github/workflows/release.yml`. Create and publish a GitHub Release whose tag matches `package.json#version`; the workflow checks, builds, packs, and publishes to npm through Trusted Publishing.

## 1. Review Package Metadata

Check `package.json`:

- `name` is `@devmc12/dir-tree`
- `version` matches the release
- `license` is correct
- `repository`, `bugs`, and `homepage` point to the public repository
- `main`, `module`, and `types` point to `dist`
- `exports` includes every public subpath
- `files` allows only publishable package artifacts

Current publishable files should be limited to:

- `dist/**`
- `README.md`
- `README.zh.md`
- `LICENSE`
- `CHANGELOG.md`
- `package.json`

## 2. Update Documentation

Before a release, update the relevant docs:

- `README.md` for user-facing examples
- `docs/api.md` for public API changes
- `docs/adapters.md` for source adapter changes
- `docs/annotations.md` for annotation workflow changes
- `docs/playground.md` for reference implementation changes
- `CHANGELOG.md` for release notes

README links to docs through GitHub URLs because `docs/` is intentionally not published to npm.

## 3. Run Core Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

These checks verify source quality, TypeScript contracts, behavior tests, and ESM/CJS/type declaration output.

## 4. Run Package Smoke Checks

```bash
npm run smoke:exports
npm run smoke:install
npm run pack:verify
```

`smoke:exports` verifies built ESM and CommonJS exports from `dist`.

`smoke:install` creates a local tarball, installs it into a temporary consumer project, and verifies ESM, CommonJS, NodeNext, and Node16 TypeScript imports.

`pack:verify` asserts that npm pack output contains only the headless package files selected by `package.json#files`.

If npm cache writes fail in a restricted local environment, use a workspace cache:

```bash
$env:DIR_TREE_NPM_CACHE='.npm-cache'; npm run pack:verify
```

## 5. Run Playground Checks

```bash
npm --prefix playground run typecheck
npm run build:playground
```

The playground is not published, but it must keep consuming the root package through public `@devmc12/dir-tree` imports. Do not add `@devmc12/dir-tree: "file:.."` to `playground/package.json`.

## 6. Inspect Pack Output

Run a dry pack when you want to inspect the tarball list manually:

```bash
npm run pack:dry
```

The output must not include:

- `playground/`
- `docs/`
- `src/`
- `test/`
- `scripts/`
- `.github/`
- Vite config
- React UI source
- playground i18n dictionaries

## 7. Publish

Publishing happens from GitHub Actions when a GitHub Release is published:

```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin main
git push origin v1.0.1
```

Then open GitHub, draft a new release for `v1.0.1`, and click **Publish release**.

The release workflow requires npm Trusted Publishing to be configured for this package:

- Provider: GitHub Actions
- Repository: `devmc12/dir-tree`
- Workflow filename: `release.yml`
- Allowed action: `Allow npm publish`

Do not enable `Allow npm stage publish` unless the workflow is changed to use npm staged publishing.

The workflow refuses to publish when:

- the release is marked as a prerelease
- the release tag does not match `v${package.json.version}`
- the same package version already exists on npm

## 8. Post-release Verification

After publishing, install the package in a clean temporary project:

```bash
npm install @devmc12/dir-tree
```

Verify root and subpath imports:

```ts
import { FileSystemReader, InMemoryFileTreeAdapter } from '@devmc12/dir-tree';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
import { parseImportedTreeText } from '@devmc12/dir-tree/parser';
```

Also verify that the npm package page does not show broken README links and does not include playground files in the package contents.
