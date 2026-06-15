# API Reference

This reference describes the public package entry points for `@devmc12/dir-tree` v1.0.0.
The package is headless: all APIs in `src/` are UI-free and do not depend on
React, Next.js, Zustand, toast libraries, analytics, or application i18n.

## Import Paths

| Import path                     | Status       | Purpose                                                             |
| ------------------------------- | ------------ | ------------------------------------------------------------------- |
| `@devmc12/dir-tree`             | Stable       | Root reader, common adapters, common tree/parser/ascii helpers      |
| `@devmc12/dir-tree/adapters`    | Stable       | Source adapters and remote repository helpers                       |
| `@devmc12/dir-tree/annotations` | Stable       | Annotation provider, patch, diff, and annotated ASCII helpers       |
| `@devmc12/dir-tree/ascii`       | Stable       | ASCII tree rendering and render option helpers                      |
| `@devmc12/dir-tree/parser`      | Stable       | Imported tree text parsers                                          |
| `@devmc12/dir-tree/tree`        | Stable       | Pure tree editing, visibility, expansion, path, and stats utilities |
| `@devmc12/dir-tree/transfer`    | Stable       | JSON import/export helpers                                          |
| `@devmc12/dir-tree/node`        | Stable       | Node.js-only filesystem adapter                                     |
| `@devmc12/dir-tree/browser`     | Experimental | Browser-only picker and dropped source helpers                      |
| `@devmc12/dir-tree/selection`   | Experimental | Pure cascading tree selection model                                 |

`browser` and `selection` are usable in v1.0.0, but they may be refined in
future minor releases.

## Core Reader

```ts
import {
  attachFileTreeMetadata,
  createFileTreeFromSnapshot,
  FileSystemReader,
  formatSize,
  getFileTreeMetadata,
  InMemoryFileTreeAdapter,
  type FileNode,
  type ReadOptions,
} from '@devmc12/dir-tree';
```

### `FileNode`

`FileNode` is the shared tree shape used across readers, parsers, renderers,
transfers, annotations, and playground UI.

```ts
interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  mimeType?: string;
  children?: FileNode[];
  handle?: FileNodeHandle;
}
```

`path` is the stable identifier for tree operations and annotation maps.
Directory nodes can have `children`; file nodes normally do not.

### `ReadOptions`

```ts
interface ReadOptions {
  depth?: number;
  sort?: SortOptions;
  exclude?: string[];
  showHidden?: boolean;
  useGitignore?: boolean;
  readFileMeta?: boolean;
  concurrency?: boolean | { limit?: number };
  mode?: 'read' | 'readwrite';
}
```

Use `createReadOptionsFromConfig` when a host application stores options as UI,
CLI, or persisted configuration values.

```ts
import { createReadOptionsFromConfig } from '@devmc12/dir-tree';

const options = createReadOptionsFromConfig({
  excludePatterns: 'node_modules\ndist',
  foldersFirst: true,
  sortBy: 'name',
  sortOrder: 'asc',
});
```

Common root helpers:

- `createFileTreeFromSnapshot(root, options?, metadataMode?)` clones an existing
  `FileNode` tree while applying read filters and optional metadata retention
- `attachFileTreeMetadata(root)` attaches non-enumerable lookup metadata used by
  tree UIs and fast path operations
- `getFileTreeMetadata(root)` reads attached metadata without rebuilding it
- `formatSize(bytes)` formats byte sizes for human-readable labels

## Adapters

Adapters implement `IFileSystemAdapter` and are passed to `FileSystemReader`.

```ts
interface IFileSystemAdapter {
  read(options?: ReadOptions): Promise<FileNode>;
}
```

Public adapters:

- `InMemoryFileTreeAdapter`
- `NodeFileSystemAdapter` from `@devmc12/dir-tree/node`
- `LocalFileSystemAdapter`
- `LegacyDirectoryFilesAdapter`
- `DroppedDirectoryEntryAdapter`
- `ZipFileSystemAdapter`
- `RemoteRepositoryFileSystemAdapter`

See [Adapters](adapters.md) for environment notes and examples.

Use `NodeFileSystemAdapter` from `@devmc12/dir-tree/node` when reading a real filesystem
path in Node.js. It is intentionally separated from the browser-safe package
entries so client bundlers do not pull in `node:fs`.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';

const tree = await new FileSystemReader(
  new NodeFileSystemAdapter('./project')
).read({ readFileMeta: true, useGitignore: true });
```

## Parser

```ts
import {
  parseImportedAsciiTreeText,
  parseImportedMarkdownDocumentTreeText,
  parseImportedMarkdownListTree,
  parseImportedTreeHtml,
  parseImportedTreeJson,
  parseImportedTreeText,
  parseImportedTreeXml,
} from '@devmc12/dir-tree/parser';
```

`parseImportedTreeText` auto-detects common formats unless a specific format is
provided.

```ts
const parsed = parseImportedTreeText(rawText, 'project', {
  format: 'auto',
});
```

Return type:

```ts
interface ParsedImportedTree {
  tree: FileNode;
  annotations: TreeAnnotationMap;
}
```

Supported formats:

- `ascii`
- `tree-html`
- `tree-json`
- `tree-xml`
- `markdown-list`
- `auto`

## ASCII Rendering

```ts
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
  renderAsciiTreeLines,
  type AsciiTreeOptions,
} from '@devmc12/dir-tree/ascii';
```

`renderAsciiTree` returns a string. `renderAsciiTreeLines` returns structured
line data with the source node path attached.

```ts
const output = renderAsciiTree(tree, {
  connectorStyle: 'unicode',
  showLineNumbers: true,
  showFileSize: true,
  showModifiedTime: true,
});
```

Use `createAsciiTreeOptionsFromConfig` when mapping UI or persisted settings to
render options.

## Tree Operations

```ts
import {
  cloneFileNode,
  createFileTreeNode,
  createFocusedFileTree,
  createPreparedFileTree,
  createVisibleFileTree,
  findFileNodeLocation,
  moveFileTreeNode,
  normalizeExpandedFileTreeItems,
  removeFileTreeNode,
  removeFileTreeNodes,
  renameFileTreeNode,
} from '@devmc12/dir-tree/tree';
```

Tree operations are pure from a host application perspective. They return cloned
trees or structured edit results and do not own UI state.

Common helpers:

- `createPreparedFileTree(root)` clones a tree and attaches metadata
- `createVisibleFileTree(root, visibility)` removes or collapses hidden nodes
- `createFocusedFileTree(root, focusedPaths)` keeps selected paths and ancestors
- `createFileTreeNode(root, parentPath, options)` creates a file or directory
- `renameFileTreeNode(root, targetPath, nextName)` renames a node and remaps paths
- `moveFileTreeNode(root, dragPath, target)` moves a node and remaps paths
- `removeFileTreeNode(root, targetPath)` removes one node
- `removeFileTreeNodes(root, paths)` removes multiple nodes

## Transfer

```ts
import {
  createExportedFileTreeJson,
  createFileTreeDownloadFilename,
  extractImportedFileTreeRootName,
  parseImportedFileTreeJson,
} from '@devmc12/dir-tree/transfer';
```

Transfer helpers serialize a tree with optional annotation and visibility data.
They remove non-serializable handles before export.

```ts
const json = createExportedFileTreeJson(tree, annotations, { visibility });
const parsed = parseImportedFileTreeJson(json);
```

## Annotations

```ts
import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createAnnotationProviderRequest,
  createEditedAsciiAnnotationDiff,
  createTreeAnnotationPatchesFromProviderResult,
  parseAnnotatedAsciiTree,
  renderAnnotatedAsciiTree,
  resolveTreeAnnotationsAfterRead,
} from '@devmc12/dir-tree/annotations';
```

Annotations are keyed by `FileNode.path`. The package does not call model APIs;
it only defines provider contracts and diff/patch utilities.

Use `resolveTreeAnnotationsAfterRead` after reading a fresh source when a host
application wants to reset annotations or retain only paths that still exist in
the new tree.

See [Annotations](annotations.md) for a provider workflow.

## Browser Helpers

```ts
import {
  isDirectoryDragAndDropSupported,
  isDirectoryPickerSupported,
  isLegacyDirectoryPickerSupported,
  isNativeDirectoryPickerSupported,
  openLegacyDirectoryPicker,
  resolveDroppedFileTreeSource,
} from '@devmc12/dir-tree/browser';
```

These helpers are browser-only. Import them only from browser entry points or
code paths that guard runtime access.

## Selection

```ts
import {
  createTreeSelectionModel,
  normalizeTreeSelectedIds,
  toggleTreeSelection,
} from '@devmc12/dir-tree/selection';
```

Selection helpers provide a pure cascading checked/indeterminate/unchecked model
for tree UIs. They do not depend on React or any specific tree component.
