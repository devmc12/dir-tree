<!-- BEGIN:project-overview -->

# Dir Tree (headless package)

`dir-tree` is a headless TypeScript library that turns local directories, ZIP files, remote GitHub/GitLab repositories, imported tree text, or in-memory data into a stable `FileNode` tree. It ships pure tree operations, ASCII rendering, JSON transfer, annotation diff utilities, and optional browser source helpers.

The package is intentionally headless. It MUST NOT depend on or ship React, UI frameworks, Vite, Next.js, Zustand, toast libraries, analytics SDKs, or site-specific i18n. Application orchestration (state stores, hooks, toasts, analytics, persistence) stays in the consuming app, not here.

Key principles:

- Pure and isomorphic core. Functions return new data instead of mutating host state, and the root entry stays runtime-agnostic
- Browser-only APIs live under `src/browser` and are never re-exported from the root entry. The Node.js filesystem adapter (`src/adapters/NodeFileSystemAdapter.ts`, which imports `node:fs`) is surfaced only through the `@devmc12/dir-tree/node` entry, never from the root or `@devmc12/dir-tree/adapters`
- The annotation layer defines provider payloads, results, patches, and diffs only. It never calls an AI service or any network model

<!-- END:project-overview -->

<!-- BEGIN:tech-stack -->

# Tech Stack And Tooling

- Language: TypeScript (`strict`, `exactOptionalPropertyTypes: true`)
- Build: `tsup` emits ESM, CommonJS, and type declarations per entry
- Test: `vitest`
- Lint: `eslint`
- Format: `prettier`
- Runtime target: Node.js `>=18.18`, ES2020

<!-- END:tech-stack -->

<!-- BEGIN:structure-rules -->

# Source Structure And Module Boundaries

```
src
├── adapters         Source adapters and remote repository helpers
│   └── remoteRepository  GitHub/GitLab fetch clients, URL parse, branch and entry mapping
├── annotations      Annotation provider, patch, diff, options, and annotated ASCII
├── ascii            ASCII tree rendering, options, and monospace utilities
├── browser          Optional browser-only picker and dropped source helpers
├── node             Node.js-only entry exposing the filesystem adapter
├── parser           Imported tree text parsers (JSON, XML, HTML, Markdown, ASCII)
├── reader           FileSystemReader, read options, metadata, and reader utilities
├── selection        Pure cascading tree selection model
├── transfer         JSON tree import/export helpers
└── tree             Pure tree editing, visibility, expansion, path, and stats utilities
```

Each top-level folder maps to a package subpath export defined in `package.json#exports` (for example `@devmc12/dir-tree/tree`, `@devmc12/dir-tree/annotations`).

Rules:

- The root entry (`src/index.ts`) re-exports the common isomorphic API. Do not add browser-only helpers (anything under `src/browser`) to the root entry
- Place new code in the module that matches its concern, next to its siblings. For example, remote repository helpers go under `src/adapters/remoteRepository` and are surfaced through `@devmc12/dir-tree/adapters`
- When a new public export is added, update `package.json#exports` only if a new subpath is introduced, keep `scripts/smoke-exports.mjs` representative, and add a `CHANGELOG.md` entry
- Keep `src`, `test`, `scripts`, `playground`, and `docs` out of the npm tarball. `scripts/verify-pack-boundary.mjs` enforces this boundary

<!-- END:structure-rules -->

<!-- BEGIN:commenting-rules -->

# Code Comments

Comments are written in English. Only three kinds are required: file headers, function/method comments, and constant comments. Do not add trailing comments; put any inline note on the line above the code. Do not end comments with a period.

## File header

Place a header block after the imports (at the top when there are no imports), with one blank line above and below. `Date` marks first creation and is not updated later.

```ts
/**
 * Date: YYYY-MM-DD
 * Desc: Brief description of the file responsibility
 */
```

## Functions and constants

Use a JSDoc block for exported functions and any function with a non-obvious contract or return shape. Add a `//` comment above a module-level constant when its name does not explain why it exists.

```ts
/**
 * Reads the default branch and branch list for a repository URL
 * @param options Repository URL with optional abort signal and access token
 * @returns Resolved branches, default branch, parsed URL, ref, and path
 */
export async function resolveRemoteRepositoryBranches(options) {}

// Upper bound for configurable annotation columns
export const MAX_TREE_ANNOTATION_COMMENT_COLUMN = 96;
```

<!-- END:commenting-rules -->

<!-- BEGIN:verification-rules -->

# Verification

After code changes, run the relevant checks before considering the work done:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:exports
npm run pack:verify
```

`npm run build` must succeed because `smoke:exports`, `smoke:install`, and `pack:verify` operate on the `dist` output.

<!-- END:verification-rules -->
