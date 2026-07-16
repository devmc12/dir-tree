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

## 3. Prepare A Release

Run the interactive release script from a clean `main` branch:

```bash
npm run release
```

The script accepts a stable version such as `1.0.3` or `v1.0.3`. It does not accept prerelease or build metadata versions.

The release order is intentionally fixed:

1. Verify Git, npm, package versions, tags, and `CHANGELOG.md`
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`
3. Run the complete release checks against the final package version
4. Commit `release: v1.0.3`
5. Create annotated tag `v1.0.3` on that release commit
6. Optionally push `main` and the tag atomically
7. Optionally publish a GitHub Release, which triggers npm Trusted Publishing

Do not tag the feature commit before the version update. The release workflow checks out the tag and requires it to contain the matching `package.json#version`.

### Preconditions

The script stops before modifying files unless all of these conditions are true:

- Node.js satisfies the package engine, and npm and Git are available
- The command is running from the repository root
- The current branch is `main` with upstream `origin/main`
- The worktree is completely clean, including untracked files
- No merge, rebase, cherry-pick, revert, or bisect is in progress
- Git author name and email are configured
- Package and lockfile versions match
- `CHANGELOG.md` contains exactly one non-empty `## Unreleased` section
- The target version is stable, newer than the current version, and does not already have a changelog section
- The current version tag exists locally and remotely, resolves to the same commit, and is an ancestor of `HEAD`
- Local `main` is not behind or diverged from `origin/main`
- The target tag does not exist locally or remotely
- The target package version returns an explicit `E404` from `https://registry.npmjs.org/`
- The `origin` URL identifies a GitHub repository that can provide the Full Changelog compare URL

Local commits ahead of `origin/main` are allowed. They are included in the release range and pushed together with the release commit.

After these checks, the script displays the normalized version, previous and target tags, complete `Unreleased` content, and a passed-check list. The first confirmation defaults to Yes:

```text
Prepare local release v1.0.3? [Y/n]
```

Declining at this point exits without changing files.

### Version And Changelog Update

The script uses npm to update both package manifests without creating an npm commit or tag:

```bash
npm version 1.0.3 --no-git-tag-version --ignore-scripts
```

It keeps an empty `Unreleased` section and moves its previous contents into the new version:

```md
## Unreleased

## 1.0.3

- Release change

## 1.0.2
```

The changelog keeps its existing line endings, Markdown, and version-heading format. The promoted version content is also used verbatim in the GitHub Release notes.

### Automated Checks

The script installs clean dependencies and runs:

```bash
npm ci
npm ci --prefix playground
npm ci --prefix playground-node

npm run lint
npm run typecheck
npm run test
npm run test:release-script
npm run build
npm run smoke:exports
npm run smoke:install
npm run pack:dry
npm run pack:verify
npm --prefix playground run typecheck
npm run build:playground
npm run typecheck:playground-node
git diff --check
```

`smoke:install` creates a local tarball, installs it into a temporary consumer project, and verifies ESM, CommonJS, NodeNext, and Node16 TypeScript imports. `pack:verify` asserts that npm pack output contains only files allowed by `package.json#files`.

The release stops if the worktree contains any path other than the expected changes to `package.json`, `package-lock.json`, and `CHANGELOG.md` after these checks.

`smoke:exports` verifies the built ESM and CommonJS entry points. The browser playground must continue consuming the public `@devmc12/dir-tree` package imports; do not add `@devmc12/dir-tree: "file:.."` to `playground/package.json`.

If npm cache writes fail in a restricted local environment while troubleshooting a check manually, use the ignored workspace cache:

```powershell
$env:DIR_TREE_NPM_CACHE='.npm-cache'; npm run pack:verify
```

The dry pack and boundary verification must exclude source and development-only paths such as `playground/`, `docs/`, `src/`, `test/`, `scripts/`, `.github/`, Vite config, React UI source, and playground i18n dictionaries.

## 4. Release Commit, Tag, And Push

After all checks pass, the script creates:

```bash
git commit -m "release: v1.0.3"
git tag -a v1.0.3 -m "Release v1.0.3"
```

The tag is verified as an annotated tag that peels to the new release commit.

The push prompt defaults to Yes:

```text
Push main and v1.0.3 to origin atomically? [Y/n]
```

The script fetches `origin` again and refuses to push if remote `main` moved while checks were running. A confirmed push uses one atomic operation:

```bash
git push --atomic origin \
  refs/heads/main:refs/heads/main \
  refs/tags/v1.0.3:refs/tags/v1.0.3
```

If the user declines, the local release commit and tag remain available and the script prints an immutable SHA-pinned equivalent for later use.

## 5. GitHub Release Notes

The GitHub Release title is the tag, for example `v1.0.3`.

The generated notes use the previous and current release tags as the range:

```md
# dir-tree v1.0.3

> 3 commits · 12 files changed · +520 / -83
>
> Full Changelog: [v1.0.2...v1.0.3](https://github.com/devmc12/dir-tree/compare/v1.0.2...v1.0.3)

## Overview

- fix: first change
- feat: second change
- release: v1.0.3

## Changelog

- Current release changelog entry
```

The statistics and overview are generated from `v1.0.2..v1.0.3`:

- Commit count and subjects include the release commit
- Commit subjects are listed oldest to newest using their first line only
- Binary files count as changed files but contribute zero inserted or deleted lines
- The Full Changelog link uses GitHub's three-dot compare URL
- The Changelog section is copied directly from the promoted version section

The GitHub repository URL is derived from `origin`; HTTPS, SCP-style SSH, and `ssh://` GitHub URLs are supported.

## 6. Publish The GitHub Release

Publishing the GitHub Release is a separate prompt that defaults to No because it immediately triggers the npm release workflow:

```text
Publish GitHub Release v1.0.3 now?
This will trigger npm publishing. [y/N]
```

Choosing No leaves the pushed commit and tag unchanged and prints the manual GitHub Release URL, title, and complete generated notes for later use.

The script tries these methods in order:

1. Authenticated `gh release create` with `--verify-tag`
2. GitHub REST API using `GH_TOKEN` or `GITHUB_TOKEN`
3. Manual fallback with the release URL, title, and complete generated notes

Tokens are only read from environment variables and are never printed, stored, or forwarded to npm scripts, Git hooks, Git, or `gh`. A fine-grained token should be restricted to this repository with `Contents: write`.

The GitHub API path treats an existing published stable Release for the same tag as an idempotent success. An existing draft or prerelease is reported for manual review instead of being treated as published. Timeouts and validation responses are followed by another lookup before reporting failure.

The script never runs local `npm publish`. Publishing remains owned by `.github/workflows/release.yml` and npm Trusted Publishing.

## 7. Failure Recovery

Before the release commit exists, any failed check or interruption restores the original bytes of `package.json`, `package-lock.json`, and `CHANGELOG.md`. The script never uses `git reset --hard`.

After the release commit exists:

- A tag failure leaves the commit intact and prints the tag command
- An atomic push failure leaves the local commit and tag intact and prints the retry command
- A GitHub Release failure leaves the pushed commit and tag intact and prints the manual release details
- A published GitHub Release is never automatically deleted or rolled back because npm publishing might already be running

Unexpected tracked changes created by a check are reported and preserved for inspection instead of being deleted.

If the release commit exists but the annotated tag was not created, run:

```bash
git tag -a v1.0.3 -m "Release v1.0.3" <release-commit-sha>
```

If the local commit and tag exist but the atomic push did not complete, refresh and review `origin/main`, then retry:

```bash
git fetch origin --tags
git push --atomic origin \
  <release-commit-sha>:refs/heads/main \
  <annotated-tag-object-sha>:refs/tags/v1.0.3
```

The script prints the exact immutable SHAs. Use those values instead of a later `HEAD` or `main`, which may have moved since the release was prepared.

If GitHub Release creation fails after the push, open:

```text
https://github.com/devmc12/dir-tree/releases/new?tag=v1.0.3&title=v1.0.3
```

Use `v1.0.3` as the title and paste the complete notes printed by the script. Publishing that Release triggers the npm workflow, so verify the tag and notes before clicking **Publish release**.

## 8. Trusted Publishing Configuration

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

## 9. Post-release Verification

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
