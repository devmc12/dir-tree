# Release

`npm run release` prepares a version, creates an annotated tag, and offers to push and publish it. Publishing a GitHub Release triggers npm publishing through `.github/workflows/release.yml`; pushing a commit or tag alone does not.

## Prepare

Use Node.js 22 and a clean `main` branch tracking `origin/main`.

- Commit the code and documentation changes first, with the release changes in `CHANGELOG.md` under `## Unreleased`.
- Keep `package.json` and `package-lock.json` at the same current version. The script updates both to the version you choose.
- The current version tag must exist locally and remotely at the same commit. The new stable version must be newer and unused in Git and npm.
- Configure a Git author, access to `origin`, and npm Trusted Publishing as described below.

## Run

From the repository root:

```bash
npm run release
```

Enter a stable version such as `2.3.0` or `v2.3.0`. Prerelease and build suffixes are not supported.

The script validates the repository, updates both manifests, moves the unreleased changelog into the new version section, installs dependencies, and runs library and Playground checks. It then creates `release: vX.Y.Z` and an annotated `vX.Y.Z` tag on that commit.

| Prompt                 | Default | Result                            |
| ---------------------- | ------- | --------------------------------- |
| Prepare local release  | Yes     | Update, validate, commit, and tag |
| Push branch and tag    | Yes     | Push both atomically              |
| Publish GitHub Release | No      | Trigger the npm release workflow  |

Choose No at the push prompt to keep the release local. The script prints a command using the exact release commit and tag object for later pushing.

## Release Notes

The script generates the GitHub Release title and body from Git history and `CHANGELOG.md`:

- Commit overview and count, excluding the generated release commit.
- Changed-file and line statistics, plus a link comparing the previous and new tags.
- The new version's changelog entries.

For automated GitHub Release creation, authenticate `gh`, or set `GH_TOKEN` / `GITHUB_TOKEN` with repository Contents write permission. Otherwise, use the release URL, title, and notes printed by the script to publish through GitHub.

## Resume After An Interruption

Before the release commit, a failed check restores the original manifests and changelog. Fix the reported failure and rerun the script. Unexpected changes to other files are preserved for inspection.

Once the version commit exists, resume from the missing step instead of running the version bump again. This also applies to a version prepared manually. Use the release commit and tag values printed by the script; replace the placeholders below with those values.

If the annotated tag is missing:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z" <release-commit-sha>
git cat-file -t refs/tags/vX.Y.Z
git rev-parse "vX.Y.Z^{commit}"
```

The object type must be `tag`, and its commit must contain the matching package and lockfile version.

If pushing failed, review remote changes before retrying the script's SHA-pinned atomic push command. If GitHub Release creation failed, use the printed manual release URL and notes for the existing tag. Do not replace a published tag or republish an npm version.

## npm Trusted Publishing

Configure the package's Trusted Publisher with:

| Setting    | Value              |
| ---------- | ------------------ |
| Provider   | GitHub Actions     |
| Repository | `devmc12/dir-tree` |
| Workflow   | `release.yml`      |
| Action     | Allow npm publish  |

The workflow skips prereleases and rejects tag/version mismatches or an already-published npm version. It validates and builds the package, then publishes it with provenance.

## Verify

Check that the release workflow completed and install the exact published version in a clean temporary project:

```bash
npm install @devmc12/dir-tree@X.Y.Z
```

Check root and subpath imports and the npm README links. The package should contain only `dist`, package metadata, READMEs, LICENSE, and CHANGELOG. Package checks are described in [Contributing](../CONTRIBUTING.md#checks).
