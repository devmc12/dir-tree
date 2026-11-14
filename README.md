<!-- prettier-ignore-start -->

<div align="center">

# Dir Tree

### Headless directory tree toolkit for browser and Node.js apps

[![npm version](https://img.shields.io/npm/v/@devmc12/dir-tree.svg)](https://www.npmjs.com/package/@devmc12/dir-tree)
[![npm downloads](https://img.shields.io/npm/dm/@devmc12/dir-tree.svg)](https://www.npmjs.com/package/@devmc12/dir-tree)
[![License](https://img.shields.io/npm/l/@devmc12/dir-tree.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/@devmc12/dir-tree.svg)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

**English** | [简体中文](./README.zh.md)

</div>

<!-- prettier-ignore-end -->

`dir-tree` turns local folders, ZIP archives, GitHub/GitLab repositories, pasted tree text, or in-memory data into a stable `FileNode` tree — then lets you render it as ASCII, edit it, annotate it, and export it. The core is pure and runtime-agnostic, so the same logic runs in Node.js and the browser, with no UI dependencies.

> This package is the headless version of [dir-tree.com](https://dir-tree.com/) — try the full app there.

![Dir Tree overview](https://dir-tree.com/images/share/dir-tree-overview.png)

## Features

- **Many sources** — read local directories, ZIP archives, GitHub/GitLab repositories, imported text, or in-memory trees through a shared adapter interface
- **Configurable ASCII rendering** — connector styles, indentation, line numbers, full paths, and file size / modified-time metadata
- **Pure tree editing** — create, rename, move, delete, focus, visibility, and expansion helpers that return new trees instead of mutating your state
- **Import and export** — parse JSON, XML, HTML, Markdown, or ASCII tree text, and export back to JSON or ASCII
- **Annotations** — provider-agnostic request, diff, and patch helpers for per-node comments; bring your own AI or manual workflow
- **Isomorphic and modular** — tree-shakeable subpath exports, ships ESM, CommonJS, and type declarations, runs in Node.js and the browser

## Install

Requires Node.js `>=18.18.1` when used in Node.js. Upgrading from 1.x? Follow the [migration guide](https://github.com/devmc12/dir-tree/blob/main/docs/migrate-v2.md).

```bash
npm install @devmc12/dir-tree
```

The package includes TypeScript declarations. Use `/node` for filesystem paths and `/browser` for browser directory APIs.

## Quick Start

Constructor options are defaults; `read(options)` overrides only that call. Use `exclude: []` to clear default exclusions. Keep the adapter to read the source again.

Call `adapter.read()` directly, or use `FileSystemReader` to hold and switch adapters:

```ts
import { FileSystemReader, InMemoryFileTreeAdapter } from '@devmc12/dir-tree';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';

const reader = new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'project',
    path: 'project',
    kind: 'directory',
    children: [
      {
        name: 'src',
        path: 'project/src',
        kind: 'directory',
        children: [
          {
            name: 'index.ts',
            path: 'project/src/index.ts',
            kind: 'file',
          },
        ],
      },
    ],
  })
);

const tree = await reader.read({
  depth: 3,
  exclude: ['node_modules', 'dist'],
  sort: { sortBy: 'name', order: 'asc', foldersFirst: true },
});

console.log(renderAsciiTree(tree));
```

### Read Timing

Built-in adapters optionally report one timing result per successful read while still returning a `FileNode`:

```ts
const tree = await reader.read({
  onTiming: ({ prepareMs, treeMs, totalMs }) => {
    console.log({ prepareMs, treeMs, totalMs });
  },
});
```

Durations are milliseconds spent preparing the source, processing the tree, and completing the read. See [Read Timing](https://github.com/devmc12/dir-tree/blob/main/docs/api.md#read-timing) for measurement boundaries and callback behavior.

## Read Sources

### In-memory Tree

Use `InMemoryFileTreeAdapter` when your application already has tree-shaped data or when you need deterministic tests.

```ts
import { FileSystemReader, InMemoryFileTreeAdapter } from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'docs',
    path: 'docs',
    kind: 'directory',
    children: [{ name: 'api.md', path: 'docs/api.md', kind: 'file' }],
  })
).read();
```

### Node.js Directory Path

Use `NodeFileSystemAdapter` from `@devmc12/dir-tree/node` to read a directory path from disk.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';

const tree = await new FileSystemReader(
  new NodeFileSystemAdapter('./my-project', {
    exclude: ['node_modules', 'dist'],
    useGitignore: true,
  })
).read({ readFileMeta: true });

console.log(renderAsciiTree(tree));
```

### Browser Directory Picker

Use browser helpers to detect directory picker support, then read with `LocalFileSystemAdapter` from a user action. The adapter retains the selected handle for refreshes.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import {
  isNativeDirectoryPickerSupported,
  LocalFileSystemAdapter,
} from '@devmc12/dir-tree/browser';

if (!isNativeDirectoryPickerSupported()) {
  throw new Error('Directory picking is not supported');
}

const reader = new FileSystemReader(new LocalFileSystemAdapter());
const tree = await reader.read({ readFileMeta: true });
```

For browsers without the native picker, use the [legacy directory adapter](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md#legacy-directory-files-adapter).

### ZIP Files

Use `ZipFileSystemAdapter` with `Blob`, `ArrayBuffer`, or `Uint8Array` input.

```ts
import { FileSystemReader, ZipFileSystemAdapter } from '@devmc12/dir-tree';

const response = await fetch('/fixtures/project.zip');
const tree = await new FileSystemReader(
  new ZipFileSystemAdapter(await response.arrayBuffer(), {}, 'project')
).read({ showHidden: false });
```

### Remote Repositories

Use `RemoteRepositoryFileSystemAdapter` for GitHub or GitLab repository trees. Pass a token when the provider needs authenticated requests, or inject a custom API client for tests and self-hosted integrations.

```ts
import {
  FileSystemReader,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new RemoteRepositoryFileSystemAdapter({
    repositoryUrl: 'https://github.com/example/project/tree/main/src',
    token: 'github-token',
  })
).read({ depth: 4 });
```

The adapter follows pagination and recovers truncated GitHub trees. Large repositories can require many API requests; use a token or a narrower tree URL when needed. See [Remote Repository Adapter](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md#remote-repository-adapter) for branch helpers, custom clients, and errors.

## Parse And Render

Parse imported JSON, XML, HTML, Markdown list, Markdown document, or ASCII tree text into a `FileNode` tree, then render it back to ASCII.

```ts
import { parseImportedTreeText } from '@devmc12/dir-tree/parser';
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
} from '@devmc12/dir-tree/ascii';

const parsed = parseImportedTreeText(
  `project
  ├── src
  └── README.md`,
  'project'
);

const ascii = renderAsciiTree(
  parsed.tree,
  createAsciiTreeOptionsFromConfig({
    connectorStyle: 'unicode',
    showLineNumbers: true,
  })
);
```

## Edit Trees

For edits to previously rendered text, use [`parseEditedAsciiTree`](https://github.com/devmc12/dir-tree/blob/main/docs/api.md#ascii-rendering) with the original render baseline. Its optional `detectRenames` setting, available since 2.2.0, recognizes unambiguous root and same-parent renames.

Tree operations are pure. They return cloned trees or structured edit results without mutating host UI state.

```ts
import { createFileTreeNode, renameFileTreeNode } from '@devmc12/dir-tree/tree';

const created = createFileTreeNode(tree, 'project/src', {
  kind: 'file',
  name: 'new-file.ts',
});

const renamed = created
  ? renameFileTreeNode(created.tree, created.path, 'main.ts')
  : null;
```

## Export And Import JSON

Use transfer helpers when you need a serializable tree file with optional annotations and visibility state.

```ts
import {
  createExportedFileTreeJson,
  parseImportedFileTreeJson,
} from '@devmc12/dir-tree/transfer';

const json = createExportedFileTreeJson(tree, annotations, { visibility });
const restored = parseImportedFileTreeJson(json);
```

## Annotations

Store comments by node path and render them beside the tree:

```ts
import { renderAsciiTreeLines } from '@devmc12/dir-tree/ascii';
import {
  applyTreeAnnotationPatches,
  renderAnnotatedAsciiTree,
} from '@devmc12/dir-tree/annotations';

const annotations = applyTreeAnnotationPatches({}, [
  { path: 'project/src/index.ts', comment: 'Application entry point' },
]);
const output = renderAnnotatedAsciiTree(
  renderAsciiTreeLines(tree),
  annotations
);
```

For generated annotations, implement `AnnotationProvider` and use the diff helpers to review and apply its results. See [Annotations](https://github.com/devmc12/dir-tree/blob/main/docs/annotations.md) for provider integration, layout options, and retention after re-reading.

## Project Structure

```
dir-tree/src
├── adapters                  # In-memory, Node.js, ZIP, and remote repository adapters
│   └── remoteRepository      # GitHub/GitLab repository tree fetching and mapping
├── annotations               # Annotation provider, patch, diff, options, and annotated ASCII
├── ascii                     # ASCII tree rendering, options, and monospace utilities
├── browser                   # Browser directory adapters, pickers, and dropped-source helpers
├── node                      # Node.js-only entry exposing the filesystem adapter
├── parser                    # Imported tree text parsers (JSON, XML, HTML, Markdown, ASCII)
├── reader                    # FileSystemReader, read options, metadata, and reader utilities
├── selection                 # Pure cascading tree selection model
├── transfer                  # JSON tree import/export helpers
└── tree                      # Pure tree editing, visibility, expansion, path, and stats utilities
```

Public entry points are listed in `package.json#exports`. Common reader APIs are available from the package root.

## Playground

Try reading, editing, annotating, and exporting trees in the [browser playground](https://github.com/devmc12/dir-tree/blob/main/docs/playground.md). From a repository checkout:

```bash
npm install
npm --prefix playground install
npm run dev:playground
```

The [Node playground](https://github.com/devmc12/dir-tree/blob/main/playground-node/README.md) demonstrates filesystem reading, parsing, annotations, editing, and JSON transfer.

## Documentation

- [Architecture and data flow](https://github.com/devmc12/dir-tree/blob/main/docs/architecture.md)
- [API reference](https://github.com/devmc12/dir-tree/blob/main/docs/api.md)
- [Migrating from 1.x to 2.0](https://github.com/devmc12/dir-tree/blob/main/docs/migrate-v2.md)
- [Adapters](https://github.com/devmc12/dir-tree/blob/main/docs/adapters.md)
- [Annotations](https://github.com/devmc12/dir-tree/blob/main/docs/annotations.md)
- [Playground](https://github.com/devmc12/dir-tree/blob/main/docs/playground.md)
- [Release checklist](https://github.com/devmc12/dir-tree/blob/main/docs/release.md)

See [Contributing](https://github.com/devmc12/dir-tree/blob/main/CONTRIBUTING.md) for development setup and test commands.
