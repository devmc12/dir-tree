# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 1.0.3

- Fixed remote repository completeness by following all GitHub/GitLab branch pages and all GitLab repository-tree pages
- Added GitHub `truncated` tree recovery through complete subtree traversal, including targeted subpath reads and explicit failure instead of partial results
- Added an interactive release script with version and changelog preparation, full validation, annotated tags, atomic pushes, and optional GitHub Release publishing
- Added generated GitHub Release notes with commit and diff statistics, compare links, commit subjects, and the current release changelog

## 1.0.2

- Fixed default Unicode ASCII output round-trip parsing for non-final file branches, including annotated whole-tree imports
- Fixed npm 12 package smoke checks and pinned the release workflow npm version for reproducible publishing

## 1.0.1

- Added a GitHub Release workflow that publishes `@devmc12/dir-tree` to npm through Trusted Publishing with provenance
- Added release guards for tag/version mismatches and already-published npm versions
- Refined README presentation with centered badges, browser-first package positioning, and natural Markdown prose wrapping
- Updated release documentation for the automated GitHub Release flow and npm Trusted Publisher settings
- Updated package homepage metadata to point to `https://dir-tree.com`

## 1.0.0

Initial release of the headless `dir-tree` toolkit.

- Headless package published as ESM, CommonJS, and TypeScript declarations, with subpath entries for `adapters`, `annotations`, `ascii`, `browser`, `node`, `parser`, `selection`, `transfer`, and `tree`
- File system reader with read-option normalization and tree metadata, plus source adapters for in-memory trees, Node.js directory paths (`NodeFileSystemAdapter` from `@devmc12/dir-tree/node`), browser directory pickers, dropped directories, ZIP archives, and remote GitHub/GitLab repositories
- Typed `RemoteRepositoryError` classification for auth, not-found, and rate-limit responses, plus remote helpers for URL parsing, ref/path resolution, branch resolution, provider entry mapping, and fetch clients
- Browser capability helpers for directory picker detection, dropped source resolution, the legacy directory picker, and exclude-pattern skip matching
- Tree text parsers for JSON, XML, HTML, Markdown list, Markdown document, and ASCII tree imports
- Configurable ASCII tree rendering with connector, indentation, line number, metadata template, and label options
- Pure tree utilities for editing, visibility, expansion, statistics, JSON transfer, and cascading selection, plus shared helpers including `attachFileTreeMetadata`, `getFileTreeMetadata`, `createFileTreeFromSnapshot`, and `formatSize`
- Annotation provider model with request building (scope, target, and overwrite options), result normalization, patching, diff review, annotated ASCII rendering and parsing, and retention utilities, with no built-in network or AI calls
- Vite React playground and a Node.js playground (`playground-node/`) that consume the package through public `@devmc12/dir-tree` imports
- English and Simplified Chinese READMEs with cross-navigation, plus API, adapter, annotation, playground, and release documentation
- CI-ready lint, typecheck, test, build, export smoke, installed-package smoke, package boundary, and playground checks
