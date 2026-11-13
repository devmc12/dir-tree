# API Reference

This reference describes the 2.0 API for `@devmc12/dir-tree`. The package is headless: all APIs in `src/` are UI-free and do not depend on React, Next.js, Zustand, toast libraries, analytics, or application i18n. See the [1.x to 2.0 migration guide](migrate-v2.md) for changes to existing integrations.

## Import Paths

| Import path | Status | Purpose |
| --- | --- | --- |
| `@devmc12/dir-tree` | Stable | Root reader, common adapters, common tree/parser/ascii helpers |
| `@devmc12/dir-tree/adapters` | Stable | Cross-environment adapters and remote repository helpers |
| `@devmc12/dir-tree/annotations` | Stable | Annotation provider, patch, diff, and annotated ASCII helpers |
| `@devmc12/dir-tree/ascii` | Stable | ASCII tree rendering and render option helpers |
| `@devmc12/dir-tree/parser` | Stable | Imported tree text parsers |
| `@devmc12/dir-tree/tree` | Stable | Pure tree editing, visibility, expansion, path, and stats utilities |
| `@devmc12/dir-tree/transfer` | Stable | JSON import/export helpers |
| `@devmc12/dir-tree/node` | Stable | Node.js-only filesystem adapter |
| `@devmc12/dir-tree/browser` | Experimental | Browser directory adapters, pickers, and dropped source helpers |
| `@devmc12/dir-tree/selection` | Experimental | Pure cascading tree selection model |

`browser` and `selection` may be refined in future releases.

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
  type ReadTiming,
} from '@devmc12/dir-tree';
```

### `FileNode`

`FileNode` is the shared tree shape used across readers, parsers, renderers, transfers, annotations, and playground UI.

```ts
interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  mimeType?: string;
  children?: FileNode[];
}
```

`path` is a logical, slash-separated identifier including the root label. It identifies a node within a tree, not an absolute path to a source file. Only directories have child nodes. When present, `size` is in bytes and `lastModified` is in milliseconds since the Unix epoch. Source handles, files, and archive bytes stay in their adapters.

`cloneFileNode` copies the declared data fields and recursively copies child nodes. It omits attached lookup metadata and unknown properties. `createPreparedFileTree` makes the same copy and builds a fresh index for the copy. `attachFileTreeMetadata` mutates the given root by adding a non-enumerable index. Treat the index from `getFileTreeMetadata` as a view of that tree; rebuild it after mutating that tree in place. The index is readable across the package's entry points and is not serialized in JSON.

Path and selection dictionaries may have a null prototype so names such as `__proto__` remain ordinary keys. Use `Object.keys`, `Object.entries`, or `Object.prototype.hasOwnProperty.call(map, path)` rather than calling a method on the map. Caller-supplied plain objects are accepted; inherited entries are not treated as data.

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
  onWarning?: (warning: ReadWarning) => void;
  onTiming?: (timing: ReadTiming) => void;
}
```

Built-in adapters snapshot their constructor defaults. `read(options)` takes a fresh set of overrides for that call; missing or undefined values inherit the constructor defaults. An override replaces the whole exclude array, sort object, or concurrency option. Repeated or concurrent reads use separate filtering state. `FileSystemReader` forwards the call to its active adapter; custom adapters define their own behavior.

The root is at depth `0`; `depth: 0` returns only the root, and omitting depth leaves it unbounded. By default, hidden entries are excluded, optional file metadata is omitted, and children sort by name ascending with directories first. Adapters with access to rule contents apply applicable `.gitignore` files; remote repositories and in-memory snapshots do not. See the [source capability table](adapters.md#read-options). Type sorting uses extension and then modification time; `foldersFirst` applies in either sort order.

Use `createReadOptionsFromConfig` for UI, CLI, or persisted settings. An empty exclude array or blank exclude text clears the default exclusions. If both fields are present, the array wins, including an empty array.

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

- `createFileTreeFromSnapshot(root, options?, metadataMode?)` clones an existing `FileNode` tree while applying read filters and optional metadata retention
- `attachFileTreeMetadata(root)` attaches non-enumerable lookup metadata used by tree UIs and fast path operations
- `getFileTreeMetadata(root)` reads attached metadata without rebuilding it
- `formatSize(bytes)` formats byte sizes for human-readable labels

### Read Timing

All built-in adapters support optional timing through `ReadOptions.onTiming`. Both direct `adapter.read()` and `FileSystemReader.read()` still return a `FileNode`; timing is not attached to nodes, indexes, or exported JSON.

```ts
interface ReadTiming {
  prepareMs: number;
  treeMs: number;
  totalMs: number;
}

const tree = await reader.read({
  onTiming: timing => {
    console.log(timing.treeMs);
  },
});
```

Values are wall-clock milliseconds from `performance.now()`, with fractional precision. Each measurement starts after the adapter validates and resolves its read options and ends after the tree and its lookup metadata are complete, before the timing callback executes. `totalMs` covers the same interval as `prepareMs` plus `treeMs`; it is not the end-to-end duration of an application action or pure CPU time.

| Adapter | `prepareMs` | `treeMs` |
| --- | --- | --- |
| Native browser directory | Waiting for a directory handle when a picker is required | Traversal, required file/rule reads, filtering, sorting, and indexing |
| Remote repository | Reference resolution and fetching default branch/tree entries, including provider pagination and response decoding | Mapping entries, filtering, sorting, and indexing |
| ZIP | `0`; the archive was supplied by the caller | Reading archive bytes, parsing/reusing its index, applicable rule reads, and tree construction |
| Node, legacy directory files, dropped directory, in-memory | `0`; the source was already supplied | All processing performed by that read, including necessary I/O |

Reusing a directory handle reports `prepareMs: 0`; concurrent reads sharing a pending picker each measure their own wait. ZIP cache hits report only the work actually performed in that call. No reads, downloads, or traversals are added for measurement. Construction, pre-read source selection or downloads by the caller, imported-text parsing outside adapters, and post-read state updates/rendering are excluded. For example, downloading a remote ZIP with `fetch()` before creating `ZipFileSystemAdapter` must be timed by the caller separately.

No timing state or clock reads are created when the callback is absent. A successful read reports once; invalid options, source failures, and cancellation do not report. Use a synchronous callback; returned promises are not awaited, and callers are responsible for handling any asynchronous errors. Synchronous `onTiming` exceptions are ignored without logging and do not prevent the completed tree from being returned. Source failures and `onWarning` exceptions retain their existing propagation behavior. Callback overrides follow the usual constructor-default/per-call rules and are isolated between reads. `FileSystemReader` only forwards options, so custom adapters that do not implement timing remain valid and do not produce fabricated measurements.

### Errors And Warnings

`FileTreeError` exposes a stable `code`, an optional tree-relative `path`, and a one-based `line` when the parser knows it. An underlying failure may be available as `cause`. Use the code for handling errors across package entry points.

Separately bundled entries can contain different error class instances. Narrow an unknown caught error structurally instead of relying on `instanceof FileTreeError` across entries:

```ts
function readFailureCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('name' in error && error.name === 'AbortError') return 'cancelled';
  return 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
```

Use the returned code in the application's existing error-message mapping. Unknown errors should still be reported or rethrown; returning no code does not mean the operation succeeded.

| Code | Meaning |
| --- | --- |
| `duplicate_tree_path` | Two imported nodes resolve to the same path |
| `invalid_tree` | Input cannot be parsed or does not describe a valid node structure |
| `invalid_read_option` | A read option such as the concurrency limit is invalid |
| `invalid_zip` | The archive index is damaged or uses an unsupported ZIP format |
| `gitignore_read_failed` | An applicable ignore file could not be opened or read |
| `read_failed` | The source could not be opened or enumerated |

An absent `.gitignore` is normal. If reading optional metadata fails, the adapter keeps the node and can call `onWarning` with `{ code: 'metadata_unavailable', source, operation: 'read_metadata', path }`. The warning carries no source contents or raw exception. The library does not log it. Cancellation such as `AbortError` propagates unchanged; remote requests retain their separate [error contract](adapters.md#remote-repository-adapter).

## Adapters

Adapters implement `IFileSystemAdapter` and are passed to `FileSystemReader`.

```ts
interface IFileSystemAdapter {
  read(options?: Partial<ReadOptions>): Promise<FileNode>;
}
```

Public adapters:

- `InMemoryFileTreeAdapter`
- `NodeFileSystemAdapter` from `@devmc12/dir-tree/node`
- `LocalFileSystemAdapter`, `LegacyDirectoryFilesAdapter`, and `DroppedDirectoryEntryAdapter` from `@devmc12/dir-tree/browser`
- `ZipFileSystemAdapter`
- `RemoteRepositoryFileSystemAdapter`

See [Adapters](adapters.md) for environment notes and examples.

Use `NodeFileSystemAdapter` from `@devmc12/dir-tree/node` when reading a real filesystem path in Node.js. It is intentionally separated from the browser-safe package entries so client bundlers do not pull in `node:fs`.

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

`parseImportedTreeText` auto-detects common formats unless a specific format is provided. All formats reject path conflicts after normalization, including a file and a directory with the same sibling name. Failed imports return no partial tree or annotations.

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

For edits to text that your application rendered, use `parseEditedAsciiTree` from the parser entry with the **original** `renderAsciiTreeLines` output and syntax:

```ts
const parsed = parseEditedAsciiTree(editedText, renderedRoot, {
  lines: originalLines,
  syntax: originalRenderOptions,
  commentTemplate: '# %comment%',
});
```

This returns the usual `tree` and `annotations`, plus `matchedPaths` for baseline nodes still recognized. It removes only evidenced display decorations (metadata, line numbers, connectors and synthetic root labels), retains known node kinds, and leaves real bracketed filenames intact. An unrecognizable edited custom label throws `FileTreeError` with its line number instead of guessing. Without baseline lines, parsing uses the ordinary text heuristics.

Keep project identity, draft revision checks, focused-scope replacement, hidden-node retention, review and undo in the host. Use `parseAnnotatedAsciiTree` for annotation-only edits and `parseImportedTreeText` for arbitrary external text; their existing contracts are unchanged.

A leading `.` in imported tree text is a display marker and uses the supplied fallback root name. Dot-mode rendered output includes a synthetic outer root; importing it preserves that displayed layer. Ordinary child names `.` and `..` remain invalid. These text formats use filename heuristics; use JSON transfer when exact node kinds, metadata, annotations, and visibility must be retained.

```ts
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
  renderAsciiTreeLines,
  type AsciiTreeOptions,
} from '@devmc12/dir-tree/ascii';
```

`renderAsciiTree` returns a string. `renderAsciiTreeLines` returns structured line data with the source node path attached.

```ts
const output = renderAsciiTree(tree, {
  connectorStyle: 'unicode',
  showLineNumbers: true,
  showFileSize: true,
  showModifiedTime: true,
});
```

Use `createAsciiTreeOptionsFromConfig` when mapping UI or persisted settings to render options.

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

Tree operations are pure from a host application perspective. They return cloned trees or structured edit results and do not own UI state.

Common helpers:

- `createPreparedFileTree(root)` clones a tree and attaches metadata
- `createVisibleFileTree(root, visibility)` removes or collapses hidden nodes
- `createFocusedFileTree(root, focusedRootPath)` clones one directory subtree with an index, or returns `null` for a missing/file target
- `createFileTreeNode(root, targetPath, options)` creates inside a directory target or next to a file target
- `renameFileTreeNode(root, targetPath, nextName)` renames a node and remaps paths
- `moveFileTreeNode(root, dragPath, target)` moves a node and remaps paths
- `removeFileTreeNode(root, targetPath)` removes one node
- `removeFileTreeNodes(root, paths)` removes multiple nodes

Creation and renaming trim the requested name and reject empty names, `.`, `..`, `/`, and NUL. They share the importer's structural validation without imposing Windows filename restrictions. Invalid edits return `null`; invalid imports throw `FileTreeError`. General text parsers retain their existing name normalization; dedicated JSON transfer retains valid platform-neutral names.

## Transfer

```ts
import {
  createExportedFileTreeJson,
  createFileTreeDownloadFilename,
  extractImportedFileTreeRootName,
  parseImportedFileTreeJson,
} from '@devmc12/dir-tree/transfer';
```

Transfer helpers serialize declared node data with optional annotation and visibility data. They omit source objects and lookup indexes. Imported JSON rebuilds paths from names and rejects duplicate paths.

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

Annotations are keyed by `FileNode.path`. The package does not call model APIs; it only defines provider contracts and diff/patch utilities.

Use `resolveTreeAnnotationsAfterRead` after reading a fresh source when a host application wants to reset annotations or retain only paths that still exist in the new tree.

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

These helpers are browser-only. Import them only from browser entry points or code paths that guard runtime access.

## Selection

```ts
import {
  createTreeSelectionModel,
  normalizeTreeSelectedIds,
  setTreeSelection,
  toggleTreeSelection,
} from '@devmc12/dir-tree/selection';
```

Selection helpers provide a pure cascading checked/indeterminate/unchecked model for tree UIs. They do not depend on React or any specific tree component.

`setTreeSelection(data, selectedIds, itemIds, checked)` checks or unchecks a complete range, including collapsed descendants. Overlapping subtrees are visited once. Parent states are derived from the remaining selected leaves, so unchecking a child cannot be undone by an already selected ancestor. Keep Shift anchors and visible row ordering in the application.

The root is a non-selectable container by default. Set `data.rootSelectable: true` for a real root that should participate in selection. Reuse the same `items` index between interactions; the helpers do not mutate it.
