# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 2.1.0

- Add `parseEditedAsciiTree` for baseline-aware edits to rendered text, keeping filename punctuation, metadata, line numbers, custom connectors and focused-root paths separate from host draft state
- Add `setTreeSelection` for batched cascading selection and optional `rootSelectable`, deduplicating overlapping subtrees while preserving 2.0.0 default and restricted-selection behavior
- Add `compareFileTrees` and `filterMatchingFileTreeState` for structural comparison and path-and-kind state retention, without guessing rename or move identities
- Add `createManualAnnotationDiffResult` and `filterAnnotationDiffByExcludedPaths` for manual comment deletion and batch review selection; provider empty-comment behavior stays unchanged
- Add `createFileTreeHiddenLookup` for one-pass inherited visibility and reuse it in the browser playground without changing its controls or export behavior
- Index rendered labels and literal decorations to avoid scanning the entire baseline for each edited row; cover combined display settings and repeated filenames with regression tests
- Document public API availability, host/library boundaries and examples; retain all 2.0.0 entry points and the existing JSON transfer format

## 2.0.0

- Add optional per-read `onTiming` reports for source preparation, tree processing, and measured total duration across built-in adapters, isolating synchronous timing callback failures from successful reads
- Accept displayed dot roots in tree text and share structural name validation between editing and importing
- Skip legacy directory ignore files outside the current read scope, loading parent rules first
- Preserve special path keys across metadata, annotations, visibility, selection, and JSON transfer
- Reuse the metadata index builder and verify ZIP record parsing with Python and .NET archive fixtures

- Isolate read overrides and ignore rules per call, and let an explicit empty exclude list clear constructor defaults
- Move browser directory adapters and dropped-entry types to the `/browser` entry
- Keep file nodes structural and remove `FileNode.handle` and `stripFileNodeHandles`; adapters retain their sources for repeated reads
- Share tree lookup metadata between independently loaded ESM and CommonJS entries
- Report unreadable ignore files with stable error codes and expose optional metadata warnings through `onWarning`
- Reject duplicate normalized paths and invalid node structures before publishing imported trees
- Index ZIP trees without inflating ordinary entries, bound filesystem I/O per read, and apply batch annotation patches with one map copy
- Resolve separate TypeScript declarations for ESM and CommonJS and verify the package on Node.js 18.18.1

## 1.0.5

- Reject tree moves that would create duplicate sibling paths while preserving same-parent reordering
- Anchor legacy directory picker gitignore rules to the selected project root consistently with other adapters
- Preserve directory-only gitignore rules and prevent excluded parent directories from being restored by child negations
- Match decoded ZIP filenames to their original content keys, preserving GBK and Unicode path metadata instead of returning empty file data

## 1.0.4

- Excluded generated `release: vX.Y.Z` commits from GitHub Release note counts and Overview entries
- Improved annotated ASCII layouts with Unicode grapheme-aware terminal widths, annotation-only global and per-folder alignment, and an independent normalized inline gap

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
