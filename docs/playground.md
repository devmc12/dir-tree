# Playground

`playground/` is the repository's Vite React reference implementation for the headless `dir-tree` package.

It is not published to npm and is not a separate React package. It exists to show a complete browser Reader workflow, validate real source/read/render flows, and keep UI code outside the headless package.

## Run

From the repository root:

```bash
npm install
npm --prefix playground install
npm run dev:playground
```

Build it from the root:

```bash
npm run build:playground
```

Or run inside `playground/`:

```bash
npm install
npm run dev
npm run build
```

## Scope

The playground is a PC-oriented full-screen ReaderView, not a minimal demo. It uses React + Vite, local `useReducer` + Context state, CSS Modules, global design tokens, and a small icon dependency. It does not use Tailwind, SCSS, shadcn/radix, Zustand, Next.js, routes, backend services, analytics, or toast services.

It demonstrates:

- sample in-memory trees
- local directory reading
- legacy directory picker fallback
- drag-and-drop source resolution
- ZIP reading
- tree create, rename, remove, visibility, expansion, and collapse behavior
- manual tree-row annotations with inline add/edit/delete controls
- annotations rendered into ASCII output and JSON export
- read options for depth, exclude patterns, hidden files, gitignore, metadata, sorting, and folders-first behavior
- ASCII render options for connector style, line numbers, directory slash, file size, and modified time
- copy and download flows for ASCII text, Markdown, and JSON
- English and Chinese UI dictionaries

The playground intentionally does not include AI annotation, mock providers, annotation provider diff review, edited ASCII annotation diff review, ASCII edit mode, focus mode, mobile drawers, tablet sheets, complex multi-select, context menus, or drag sorting. Those product-level experiences belong in host applications such as `dir-tree-web`, not in the lightweight reference implementation.

Current source organization:

- `src/App.tsx`: mounts the playground Reader
- `src/reader/ReaderPlayground.tsx`: async source operations and derived Reader data
- `src/reader/state.ts`: reducer state, actions, and tree path helpers
- `src/reader/context.tsx`: Reader Context, derived data, and action contracts
- `src/reader/*Panel.tsx` and `src/reader/ReaderToolbar.tsx`: focused UI panels
- `src/reader/Reader.module.css`: component-scoped Reader layout and controls
- `src/styles.css`: global reset and Reader design tokens
- `src/fixtures.ts`: playground-only sample data and render options
- `src/i18n/en.ts` and `src/i18n/zh.ts`: the only supported UI dictionaries

As the Reader experience evolves, keep product-only behavior in `playground/` and keep reusable, UI-free behavior in root `src/` public modules.

## i18n

The playground supports only:

- `en`
- `zh`

Dictionaries live in `playground/src/i18n`. They are not part of the npm package.

Core APIs must not return UI copy. They can return data, status, errors, and typed results that the playground translates.

## Consuming Core

Playground code should import public package entry points exactly like a consumer would:

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
```

Local Vite and TypeScript config map those public imports to root source files:

```text
@devmc12/dir-tree -> ../src/index.ts
@devmc12/dir-tree/adapters -> ../src/adapters/index.ts
@devmc12/dir-tree/annotations -> ../src/annotations/index.ts
@devmc12/dir-tree/ascii -> ../src/ascii/index.ts
@devmc12/dir-tree/browser -> ../src/browser/index.ts
@devmc12/dir-tree/selection -> ../src/selection/index.ts
@devmc12/dir-tree/transfer -> ../src/transfer/index.ts
@devmc12/dir-tree/tree -> ../src/tree/index.ts
```

Do not add `dir-tree: "file:.."` to `playground/package.json`. That creates a self-referential dependency in local development and can produce recursive `node_modules` paths on Windows.

Do not import root internals directly from playground:

```ts
// Avoid this
import { something } from '../../src/tree/internal';
```

If the playground needs reusable, UI-free behavior, first decide whether it belongs in the public `@devmc12/dir-tree` package. If it does, export it from root or a domain subpath, then import it through `dir-tree`.

## Boundary Rules

Belongs in `playground/`:

- React components
- component state and UI orchestration
- panels, tabs, controls, and layout
- language dictionaries
- copywriting
- clipboard and download events
- playground-only examples and fixtures

Belongs in root `src/`:

- source adapters
- parsers
- tree edit and visibility algorithms
- ASCII renderers
- annotation provider payload/diff/patch utilities
- JSON transfer helpers
- selection algorithms that do not depend on React

## Regression Checks

Run from the root before publishing or after larger UI migrations:

```bash
npm --prefix playground run typecheck
npm run build:playground
```

The full repository verification also runs core checks and package boundary checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:install
npm run pack:verify
npm --prefix playground run typecheck
npm run build:playground
```
