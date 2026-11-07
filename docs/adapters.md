# Adapters

Adapters turn different source types into the shared `FileNode` tree used by `dir-tree`.

```ts
import { FileSystemReader, type FileNode } from '@devmc12/dir-tree';
import { InMemoryFileTreeAdapter } from '@devmc12/dir-tree/adapters';

declare const root: FileNode;

const tree = await new FileSystemReader(
  new InMemoryFileTreeAdapter(root)
).read();
```

## Adapter Contract

```ts
interface IFileSystemAdapter {
  read(options?: Partial<ReadOptions>): Promise<FileNode>;
}
```

Host applications can implement this interface for custom sources, such as a database, an internal API, a virtual file system, or a cached tree snapshot.

## Read Options

All adapters should respect the relevant parts of [`ReadOptions`](api.md#readoptions):

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
}
```

Constructor options are defaults. Pass the current options to each read that needs them; a previous call's overrides do not persist. An explicit `exclude: []` clears the default exclude list.

You can call `adapter.read()` directly. `FileSystemReader` is an optional delegating wrapper when an application wants to hold or switch the active adapter.

All built-in adapters support depth, hidden entries, excludes, and sorting. Source-specific capabilities differ:

| Source | `useGitignore` | `readFileMeta` | Repeated reads |
| --- | --- | --- | --- |
| Node filesystem | Reads applicable rule files | Size and modification time; failures can warn | Reads the current filesystem |
| Native browser directory | Reads applicable rule files | Size, modification time, MIME when available; failures can warn | Reuses the handle and reads current entries |
| Dropped directory entry | Reads applicable rule files | Size, modification time, MIME when available; failures can warn | Reuses the entry and enumerates it again |
| Legacy file list | Reads applicable selected rule files | Copies available `File` metadata | Reuses the selected files; select again to discover new files |
| ZIP | Extracts applicable rule files only | Uncompressed size from the index | Immutable `Blob` reuses the index; mutable bytes are reindexed |
| Remote repository | Not applied; rule contents are not fetched | Size when supplied by the provider | Calls the repository API again |
| In-memory tree | Not applied; file contents are unavailable | Copies supplied node metadata | Clones the constructor snapshot |

An applicable rule file is one whose containing directory is reachable under the current depth, hidden, exclude, and parent ignore settings. Its own hidden filename does not prevent loading it. An unreadable applicable rule rejects the read; unreachable rule files are not read. Glob excludes are tested against logical paths including the root: use `node_modules` to match that name at any level, or `project/src` to anchor a path under a specific root.

For built-in filesystem traversal, omitted or `false` concurrency runs I/O sequentially, `true` uses a limit of 20, and `{ limit }` accepts a finite positive integer. The bound covers directory listing, rule reads, and file metadata across all folders in that read. Independent reads have separate limits. Legacy rule files load in parent-first order. ZIP and in-memory processing are not parallelized by this setting, and it does not control built-in or injected remote repository requests.

`mode` is the native directory picker's requested access mode. The first concurrent call that opens the picker sets it; future reads reuse the handle. `token` belongs to remote repository adapter options. To inspect optional file metadata failures in the Node, native browser, or dropped-directory adapter, pass `onWarning`; throwing from that callback rejects the read.

## In-memory Adapter

Use `InMemoryFileTreeAdapter` for already normalized data, fixtures, or tests.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { InMemoryFileTreeAdapter } from '@devmc12/dir-tree/adapters';

const reader = new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'project',
    path: 'project',
    kind: 'directory',
    children: [{ name: 'README.md', path: 'project/README.md', kind: 'file' }],
  })
);

const tree = await reader.read();
```

## Node.js Filesystem Adapter

Use `NodeFileSystemAdapter` from `@devmc12/dir-tree/node` to read a real directory path from disk in Node.js. This adapter is exported from a Node-only entry so browser bundles can keep `node:fs` out of client code.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';

const tree = await new FileSystemReader(
  new NodeFileSystemAdapter('./project', {
    exclude: ['node_modules', 'dist'],
    useGitignore: true,
  })
).read({ readFileMeta: true });
```

## Local Browser Directory Adapter

Use `LocalFileSystemAdapter` inside a user action in a browser that supports the File System Access API. Pass an existing `FileSystemDirectoryHandle` if you already selected a source.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import {
  isNativeDirectoryPickerSupported,
  LocalFileSystemAdapter,
} from '@devmc12/dir-tree/browser';

if (!isNativeDirectoryPickerSupported()) {
  throw new Error('Native directory picking is unavailable');
}

const reader = new FileSystemReader(new LocalFileSystemAdapter());
const tree = await reader.read({ mode: 'read', readFileMeta: true });
const shallowTree = await reader.read({ depth: 1 });
```

## Legacy Directory Files Adapter

Use `LegacyDirectoryFilesAdapter` with files returned by an `<input webkitdirectory>` picker.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import {
  LegacyDirectoryFilesAdapter,
  openLegacyDirectoryPicker,
} from '@devmc12/dir-tree/browser';

const files = await openLegacyDirectoryPicker();
const tree = await new FileSystemReader(
  new LegacyDirectoryFilesAdapter(files)
).read();
```

## Dropped Directory Entry Adapter

Use `DroppedDirectoryEntryAdapter` when browser drag-and-drop provides a legacy directory entry.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import {
  DroppedDirectoryEntryAdapter,
  LocalFileSystemAdapter,
  resolveDroppedFileTreeSource,
} from '@devmc12/dir-tree/browser';

declare const dataTransfer: DataTransfer;

const resolution = await resolveDroppedFileTreeSource(dataTransfer);

if (resolution.status === 'success' && resolution.source.kind === 'directory') {
  const adapter = resolution.source.entry
    ? new DroppedDirectoryEntryAdapter(resolution.source.entry)
    : resolution.source.handle
      ? new LocalFileSystemAdapter({}, resolution.source.handle)
      : null;

  if (adapter) {
    const tree = await new FileSystemReader(adapter).read();
  }
}
```

The source result retains its entry or handle for use by an adapter. Returned tree nodes do not contain it.

## ZIP Adapter

Use `ZipFileSystemAdapter` for ZIP archives. The source can be a `Blob`, `ArrayBuffer`, or `Uint8Array`.

```ts
import { FileSystemReader, ZipFileSystemAdapter } from '@devmc12/dir-tree';

declare const file: File;

const tree = await new FileSystemReader(
  new ZipFileSystemAdapter(file, {}, file.name.replace(/\.zip$/u, ''))
).read({ showHidden: false });
```

ZIP reads validate the archive index, use its uncompressed sizes, and decode only ignore files needed by the read. Ordinary payloads are neither inflated nor checked for content integrity. Stored and Deflate entries in single-volume archives are supported; encrypted archives, split archives, ZIP64 central directories, and other compression methods are rejected. The record layout follows [PKWARE's ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

Pass a `Blob` for repeated reads of the same archive to reuse its validated index and decoded rule text. Array buffers and typed array views are caller-owned and read afresh on each call; keep their bytes unchanged until that read settles. The adapter does not copy the entire caller-owned buffer.

## Remote Repository Adapter

Use `RemoteRepositoryFileSystemAdapter` for GitHub or GitLab repository trees.

```ts
import {
  FileSystemReader,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree';

const token = process.env.GITHUB_TOKEN;
const tree = await new FileSystemReader(
  new RemoteRepositoryFileSystemAdapter({
    repositoryUrl: 'https://github.com/example/project/tree/main/src',
    ...(token === undefined ? {} : { token }),
  })
).read({ depth: 3, readFileMeta: true });
```

The built-in API client guarantees complete results or throws an error:

- GitHub and GitLab branch lists follow provider pagination until the final page
- GitLab repository trees use keyset pagination and aggregate every returned page
- GitHub repository trees use one recursive request when possible; a `truncated: true` response is discarded and recovered by traversing complete subtrees through their tree SHAs
- GitHub subpath reads locate and expand only the requested subtree after a truncated root response
- Pagination and subtree requests reuse the same token and `AbortSignal`; a later-page error, rate limit, abort, or incomplete shallow tree never returns partial entries

GitHub recursive tree responses are limited by the provider to 100,000 entries or 7 MB. Large repository reads can therefore require many API requests. Pass a token for higher provider limits, and prefer a repository tree URL for a narrower subpath when the whole repository is unnecessary.

Adapter options:

```ts
interface RemoteRepositoryAdapterOptions {
  apiClient?: RemoteRepositoryApiClient;
  branchOptions?: RemoteRepositoryBranchOption[];
  defaultBranch?: string;
  path?: string;
  ref?: string;
  repositoryUrl: string;
  signal?: AbortSignal;
  token?: string;
}
```

Use `apiClient` to integrate self-hosted providers, tests, or server-side fetching policies.

```ts
import {
  RemoteRepositoryFileSystemAdapter,
  type RemoteRepositoryApiClient,
} from '@devmc12/dir-tree/adapters';

const apiClient: RemoteRepositoryApiClient = {
  async getDefaultBranch() {
    return 'main';
  },
  async listBranches() {
    return [{ name: 'main', default: true }];
  },
  async listTreeEntries() {
    return [
      { path: 'src', kind: 'directory' },
      { path: 'src/index.ts', kind: 'file', size: 128 },
    ];
  },
};

const adapter = new RemoteRepositoryFileSystemAdapter({
  apiClient,
  repositoryUrl: 'https://github.com/example/project',
});
```

Remote helper exports from `@devmc12/dir-tree/adapters` include:

- `createRemoteRepositoryApiClient`
- `parseRemoteRepositoryUrl`
- `resolveRemoteRepositoryRefPath`
- `mapRemoteRepositoryEntriesToFileTree`
- `normalizeRemoteRepositoryPath`
- `splitRemoteRepositoryPath`
- `RemoteRepositoryError`

`RemoteRepositoryError` exposes `code`, `provider`, and `status`. Rate-limit responses also include `rateLimitRemaining` and `rateLimitReset` when the provider sends those headers.

## Environment Notes

- `InMemoryFileTreeAdapter` is safe in Node.js and browsers
- `NodeFileSystemAdapter` requires Node.js and is exported from `@devmc12/dir-tree/node`
- `ZipFileSystemAdapter` works anywhere the selected source type is available
- `RemoteRepositoryFileSystemAdapter` needs `fetch` or an injected API client
- The `/browser` adapters use native directory handles, legacy `File` objects with relative paths, or dropped directory entries

## Custom Adapter Guidance

When adding a custom adapter:

- Return unique, stable `path` values with `/` separators and no source handles on nodes
- Preserve `kind: 'directory' | 'file'`
- Respect `depth`, `exclude`, `showHidden`, and `sort` where possible
- Attach `size`, `lastModified`, and `mimeType` only when available or requested
- Keep UI state, notifications, analytics, and storage outside the adapter
