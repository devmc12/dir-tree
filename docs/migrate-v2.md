# Migrate from 1.x to 2.0

The read, edit, render, and export workflow stays the same. Make the following changes when switching an application or custom adapter to 2.0.

1. **Move browser adapter imports.** Import `LocalFileSystemAdapter`, `LegacyDirectoryFilesAdapter`, `DroppedDirectoryEntryAdapter`, and the dropped-entry types from `@devmc12/dir-tree/browser`. Keep `FileSystemReader` at the root and `NodeFileSystemAdapter` at `/node`. A TypeScript Node consumer can use the library with the ES2022 lib and Node types, without DOM declarations.
2. **Keep sources in adapters.** Remove reads of `FileNode.handle` and imports of `FileNodeHandle` or `stripFileNodeHandles`. Reuse the adapter for refreshes. The handle on a browser source selection result is still available to construct the adapter. Keep any cloning you need for state isolation; `cloneFileNode` now copies declared node data, while `createPreparedFileTree` also builds a new lookup index.
3. **Pass the settings for each read.** Use constructor options as defaults and pass the current settings to each refresh. Empty exclude text and `exclude: []` clear the default list. Subclasses of `BaseFileSystemAdapter` use the context returned by `createReadContext(options)` instead of the old mutable fields, `resetReadSession`, and `getOptions`. Custom adapters that implement `ReaderAdapter` directly keep the same method signature.
4. **Handle rejected reads and imports.** Use `FileTreeError.code` for local source failures and invalid imports. A duplicate normalized path or unreadable applicable `.gitignore` now rejects the operation. Handle cancellation separately. Opt in to `onWarning` to report unavailable metadata; such failures do not remove the affected node. The [API reference](api.md#errors-and-warnings) lists the codes.
5. **Check runtime and options.** Use Node.js 18.18.1 or newer as a consumer. An explicit concurrency limit must be a finite positive integer. Use a `Blob` to reuse a ZIP index between reads, or keep caller-owned bytes unchanged while a read is in progress.
6. **Treat path maps as dictionaries.** Index, annotation, visibility, and selection maps can have a null prototype. Use `Object.keys`/`Object.entries` and own-property checks instead of `map.hasOwnProperty()`. Imported maps preserve special names such as `__proto__`; inherited properties on caller-supplied objects are ignored.

The 2.0 API starts with 2.0.0; 2.1.0 adds helpers without another migration. The two playgrounds and `dir-tree-web` have migrated away from 1.x. The Web `feature/reader-projects` branch now uses the 2.1.0 helpers and is verified through `npm run dev:local-headless` and a packed candidate. Its declared range remains `^2.0.0`, and its lockfile still resolves 2.0.0: explicitly update the Web dependency and lockfile to 2.1.0 before deploying that branch. Native picker permissions and desktop directory dragging remain manual browser checks. Passing library tests alone does not replace consumer checks.

```ts
import {
  createReadOptionsFromConfig,
  FileSystemReader,
} from '@devmc12/dir-tree';
import { LocalFileSystemAdapter } from '@devmc12/dir-tree/browser';

const reader = new FileSystemReader(
  new LocalFileSystemAdapter({ exclude: ['node_modules'] })
);

// Run the first read from a user action that may open a directory picker
const filtered = await reader.read();
const unfiltered = await reader.read(
  createReadOptionsFromConfig({ excludePatterns: '' })
);
```
