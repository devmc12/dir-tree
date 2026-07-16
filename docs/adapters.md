# Adapters

Adapters turn different source types into the shared `FileNode` tree used by `dir-tree`.

```ts
import { FileSystemReader } from '@devmc12/dir-tree';
import { InMemoryFileTreeAdapter } from '@devmc12/dir-tree/adapters';

const tree = await new FileSystemReader(
  new InMemoryFileTreeAdapter(root)
).read();
```

## Adapter Contract

```ts
interface IFileSystemAdapter {
  read(options?: ReadOptions): Promise<FileNode>;
}
```

Host applications can implement this interface for custom sources, such as a database, an internal API, a virtual file system, or a cached tree snapshot.

## Read Options

All adapters should respect the relevant parts of `ReadOptions`:

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

Some options are environment-specific. For example, `mode` applies to native browser directory handles, while `token` belongs to remote repository adapter options rather than `ReadOptions`.

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

Use `LocalFileSystemAdapter` with a `FileSystemDirectoryHandle`. This adapter is browser-only and requires the File System Access API.

```ts
import { FileSystemReader, LocalFileSystemAdapter } from '@devmc12/dir-tree';
import { isNativeDirectoryPickerSupported } from '@devmc12/dir-tree/browser';

if (!isNativeDirectoryPickerSupported()) {
  throw new Error('Native directory picking is unavailable');
}

const handle = await window.showDirectoryPicker({ mode: 'read' });
const tree = await new FileSystemReader(
  new LocalFileSystemAdapter({}, handle)
).read({ readFileMeta: true, useGitignore: true });
```

## Legacy Directory Files Adapter

Use `LegacyDirectoryFilesAdapter` with files returned by an `<input webkitdirectory>` picker.

```ts
import {
  FileSystemReader,
  LegacyDirectoryFilesAdapter,
} from '@devmc12/dir-tree';
import { openLegacyDirectoryPicker } from '@devmc12/dir-tree/browser';

const files = await openLegacyDirectoryPicker();
const tree = await new FileSystemReader(
  new LegacyDirectoryFilesAdapter(files)
).read();
```

## Dropped Directory Entry Adapter

Use `DroppedDirectoryEntryAdapter` when browser drag-and-drop provides a legacy directory entry.

```ts
import {
  FileSystemReader,
  DroppedDirectoryEntryAdapter,
} from '@devmc12/dir-tree';
import { resolveDroppedFileTreeSource } from '@devmc12/dir-tree/browser';

const resolution = await resolveDroppedFileTreeSource(dataTransfer);

if (resolution.status === 'success' && resolution.source.kind === 'directory') {
  const adapter = resolution.source.entry
    ? new DroppedDirectoryEntryAdapter(resolution.source.entry)
    : null;

  if (adapter) {
    const tree = await new FileSystemReader(adapter).read();
  }
}
```

If a dropped source returns a native `FileSystemDirectoryHandle`, use `LocalFileSystemAdapter` instead.

## ZIP Adapter

Use `ZipFileSystemAdapter` for ZIP archives. The source can be a `Blob`, `ArrayBuffer`, or `Uint8Array`.

```ts
import { FileSystemReader, ZipFileSystemAdapter } from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new ZipFileSystemAdapter(file, {}, file.name.replace(/\.zip$/u, ''))
).read({ showHidden: false });
```

ZIP support is powered by `fflate`, which is the only runtime dependency of the root package.

## Remote Repository Adapter

Use `RemoteRepositoryFileSystemAdapter` for GitHub or GitLab repository trees.

```ts
import {
  FileSystemReader,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree';

const tree = await new FileSystemReader(
  new RemoteRepositoryFileSystemAdapter({
    repositoryUrl: 'https://github.com/example/project/tree/main/src',
    token: process.env.GITHUB_TOKEN,
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
- `LocalFileSystemAdapter` needs browser File System Access API handles
- `LegacyDirectoryFilesAdapter` needs browser `File` objects with relative paths
- `DroppedDirectoryEntryAdapter` needs browser drag-and-drop directory entries

## Custom Adapter Guidance

When adding a custom adapter:

- Return stable `path` values with `/` separators
- Preserve `kind: 'directory' | 'file'`
- Respect `depth`, `exclude`, `showHidden`, and `sort` where possible
- Attach `size`, `lastModified`, and `mimeType` only when available or requested
- Keep UI state, notifications, analytics, and storage outside the adapter
