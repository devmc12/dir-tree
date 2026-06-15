import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  FileSystemReader,
  DroppedDirectoryEntryAdapter,
  InMemoryFileTreeAdapter,
  LegacyDirectoryFilesAdapter,
  LocalFileSystemAdapter,
  RemoteRepositoryFileSystemAdapter,
  ZipFileSystemAdapter,
  createReadOptionsFromConfig,
  type DroppedFileSystemDirectoryEntry,
  type DroppedFileSystemEntry,
  type DroppedFileSystemFileEntry,
  type FileNode,
  type RemoteRepositoryApiClient,
} from '../src';
import {
  createFileTreeNode,
  createFocusedFileTree,
  collapseExpandedFileTreeItems,
  filterFileTreeVisibilityByPaths,
  filterNestedFileTreePaths,
  getAutoExpandedFileTreeItems,
  remapExpandedFileTreeItemsAfterMove,
  remapFileTreeVisibility,
  createVisibleFileTree,
  moveFileTreeNode,
  normalizeExpandedFileTreeItems,
  removeFileTreeNodes,
  renameFileTreeNode,
  stripFileNodeHandles,
} from '../src/tree';

/**
 * Date: 2026-06-07
 * Desc: Verifies reader adapters and tree editing utilities
 */

const sampleTree: FileNode = {
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
          size: 120,
        },
      ],
    },
    {
      name: '.env',
      path: 'project/.env',
      kind: 'file',
    },
    {
      name: 'README.md',
      path: 'project/README.md',
      kind: 'file',
    },
  ],
};

function createLegacyDirectoryFile(
  webkitRelativePath: string,
  content: string,
  options: FilePropertyBag = {}
): File {
  const name = webkitRelativePath.split('/').at(-1) ?? webkitRelativePath;
  const file = new File([content], name, options);

  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: webkitRelativePath,
  });

  return file;
}

function createDroppedFileEntry(
  name: string,
  content: string,
  options: FilePropertyBag = {}
): DroppedFileSystemFileEntry {
  const file = new File([content], name, options);

  return {
    name,
    isDirectory: false,
    isFile: true,
    file(successCallback) {
      successCallback(file);
    },
  };
}

function createDroppedDirectoryEntry(
  name: string,
  entries: DroppedFileSystemEntry[]
): DroppedFileSystemDirectoryEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    createReader() {
      const batches = [entries, []];

      return {
        readEntries(successCallback) {
          successCallback(batches.shift() ?? []);
        },
      };
    },
  };
}

type MockLocalFileSystemHandle = MockLocalDirectoryHandle | MockLocalFileHandle;

interface MockLocalFileHandle {
  getFile: () => Promise<File>;
  kind: 'file';
  name: string;
}

interface MockLocalDirectoryHandle {
  children: MockLocalFileSystemHandle[];
  getFileHandle: (name: string) => Promise<FileSystemFileHandle>;
  kind: 'directory';
  name: string;
  [Symbol.asyncIterator]: () => AsyncIterableIterator<
    [string, FileSystemHandle]
  >;
}

function createLocalFileHandle(
  name: string,
  content: string,
  options: FilePropertyBag = {}
): MockLocalFileHandle {
  const file = new File([content], name, options);
  const handle: MockLocalFileHandle = {
    kind: 'file',
    name,
    async getFile() {
      return file;
    },
  };

  return handle;
}

function createLocalDirectoryHandle(
  name: string,
  children: MockLocalFileSystemHandle[]
): MockLocalDirectoryHandle {
  const handle: MockLocalDirectoryHandle = {
    children,
    kind: 'directory',
    name,
    async getFileHandle(fileName) {
      const child = children.find(item => item.name === fileName);

      if (!child || child.kind !== 'file') {
        throw new DOMException('File was not found', 'NotFoundError');
      }

      return child as unknown as FileSystemFileHandle;
    },
    async *[Symbol.asyncIterator]() {
      for (const child of children) {
        yield [child.name, child as unknown as FileSystemHandle];
      }
    },
  };

  return handle;
}

describe('reader adapters', () => {
  it('normalizes host read option configuration', () => {
    expect(
      createReadOptionsFromConfig({
        concurrencyEnabled: true,
        concurrencyLimit: 50,
        depth: 3,
        excludePatterns: 'node_modules\n dist \n\n',
        foldersFirst: false,
        mode: 'readwrite',
        readFileMeta: true,
        showHidden: true,
        sortBy: 'type',
        sortOrder: 'desc',
        useGitignore: false,
      })
    ).toEqual({
      concurrency: { limit: 50 },
      depth: 3,
      exclude: ['node_modules', 'dist'],
      mode: 'readwrite',
      readFileMeta: true,
      showHidden: true,
      sort: { sortBy: 'type', order: 'desc', foldersFirst: false },
      useGitignore: false,
    });

    expect(
      createReadOptionsFromConfig({
        concurrencyEnabled: false,
        exclude: [' src ', '', 'docs'],
      })
    ).toEqual({ concurrency: false, exclude: ['src', 'docs'] });
  });

  it('reads in-memory file trees with options', async () => {
    const reader = new FileSystemReader(
      new InMemoryFileTreeAdapter(sampleTree)
    );
    const tree = await reader.read({ showHidden: false, readFileMeta: true });

    expect(tree.children?.map(child => child.name)).toEqual([
      'src',
      'README.md',
    ]);
    expect(tree.children?.[0]?.children?.[0]?.size).toBe(120);
  });

  it('reads ZIP file trees with filters, metadata, and gitignore rules', async () => {
    const bytes = zipSync({
      'src/index.ts': strToU8('export const value = 1;'),
      'src/tmp/cache.txt': strToU8('cache'),
      'docs/guide.md': strToU8('guide'),
      '.env': strToU8('SECRET=1'),
      '.gitignore': strToU8('tmp/\nignored.log\n'),
      'ignored.log': strToU8('ignored'),
    });
    const reader = new FileSystemReader(
      new ZipFileSystemAdapter(
        bytes,
        {
          exclude: ['docs'],
          readFileMeta: true,
          showHidden: false,
          useGitignore: true,
        },
        'archive.zip'
      )
    );
    const tree = await reader.read();
    const src = tree.children?.find(child => child.name === 'src');

    expect(tree.children?.map(child => child.name)).toEqual(['src']);
    expect(src?.children?.map(child => child.name)).toEqual(['index.ts']);
    expect(src?.children?.[0]?.size).toBe('export const value = 1;'.length);
  });

  it('reads legacy directory file lists with filters, metadata, and gitignore rules', async () => {
    const files = [
      createLegacyDirectoryFile(
        'project/src/index.ts',
        'export const value = 1;',
        {
          lastModified: 1000,
          type: 'text/typescript',
        }
      ),
      createLegacyDirectoryFile('project/src/tmp/cache.txt', 'cache'),
      createLegacyDirectoryFile('project/docs/guide.md', 'guide'),
      createLegacyDirectoryFile('project/.env', 'SECRET=1'),
      createLegacyDirectoryFile('project/.gitignore', 'tmp/\nignored.log\n'),
      createLegacyDirectoryFile('project/ignored.log', 'ignored'),
    ];
    const reader = new FileSystemReader(
      new LegacyDirectoryFilesAdapter(files, {
        exclude: ['**/docs/**'],
        readFileMeta: true,
        showHidden: false,
        useGitignore: true,
      })
    );
    const tree = await reader.read();
    const src = tree.children?.find(child => child.name === 'src');
    const indexFile = src?.children?.[0];

    expect(tree.children?.map(child => child.name)).toEqual(['src']);
    expect(src?.children?.map(child => child.name)).toEqual(['index.ts']);
    expect(indexFile?.size).toBe('export const value = 1;'.length);
    expect(indexFile?.lastModified).toBe(1000);
    expect(indexFile?.mimeType).toBe('text/typescript');
  });

  it('reads dropped directory entries with filters, metadata, and gitignore rules', async () => {
    const rootEntry = createDroppedDirectoryEntry('project', [
      createDroppedDirectoryEntry('src', [
        createDroppedFileEntry('index.ts', 'export const value = 1;', {
          lastModified: 1000,
          type: 'text/typescript',
        }),
        createDroppedDirectoryEntry('tmp', [
          createDroppedFileEntry('cache.txt', 'cache'),
        ]),
      ]),
      createDroppedDirectoryEntry('docs', [
        createDroppedFileEntry('guide.md', 'guide'),
      ]),
      createDroppedFileEntry('.env', 'SECRET=1'),
      createDroppedFileEntry('.gitignore', 'tmp/\nignored.log\n'),
      createDroppedFileEntry('ignored.log', 'ignored'),
    ]);
    const reader = new FileSystemReader(
      new DroppedDirectoryEntryAdapter(rootEntry, {
        exclude: ['**/docs/**'],
        readFileMeta: true,
        showHidden: false,
        useGitignore: true,
      })
    );
    const tree = await reader.read();
    const src = tree.children?.find(child => child.name === 'src');
    const indexFile = src?.children?.[0];

    expect(tree.children?.map(child => child.name)).toEqual(['src']);
    expect(src?.children?.map(child => child.name)).toEqual(['index.ts']);
    expect(indexFile?.size).toBe('export const value = 1;'.length);
    expect(indexFile?.lastModified).toBe(1000);
    expect(indexFile?.mimeType).toBe('text/typescript');
  });

  it('reads local file system handles with filters, metadata, and gitignore rules', async () => {
    const rootHandle = createLocalDirectoryHandle('project', [
      createLocalDirectoryHandle('src', [
        createLocalFileHandle('index.ts', 'export const value = 1;', {
          lastModified: 1000,
          type: 'text/typescript',
        }),
        createLocalDirectoryHandle('tmp', [
          createLocalFileHandle('cache.txt', 'cache'),
        ]),
      ]),
      createLocalDirectoryHandle('docs', [
        createLocalFileHandle('guide.md', 'guide'),
      ]),
      createLocalFileHandle('.env', 'SECRET=1'),
      createLocalFileHandle('.gitignore', 'tmp/\nignored.log\n'),
      createLocalFileHandle('ignored.log', 'ignored'),
    ]);
    const reader = new FileSystemReader(
      new LocalFileSystemAdapter(
        {
          exclude: ['docs'],
          readFileMeta: true,
          showHidden: false,
          useGitignore: true,
        },
        rootHandle as unknown as FileSystemDirectoryHandle
      )
    );
    const tree = await reader.read();
    const src = tree.children?.find(child => child.name === 'src');
    const indexFile = src?.children?.[0];

    expect(tree.children?.map(child => child.name)).toEqual(['src']);
    expect(src?.children?.map(child => child.name)).toEqual(['index.ts']);
    expect(indexFile?.size).toBe('export const value = 1;'.length);
    expect(indexFile?.lastModified).toBe(1000);
    expect(indexFile?.mimeType).toBe('text/typescript');
  });

  it('reads remote repository URLs with branch path references', async () => {
    const calls: Array<{ ref: string; subPath: string | undefined }> = [];
    const apiClient: RemoteRepositoryApiClient = {
      async getDefaultBranch() {
        throw new Error('Default branch should not be requested');
      },
      async listBranches() {
        throw new Error('Branches should not be requested');
      },
      async listTreeEntries(parsedUrl, ref, options) {
        expect(parsedUrl.provider).toBe('github');
        expect(parsedUrl.owner).toBe('acme');
        expect(parsedUrl.repo).toBe('project');
        expect(options?.readFileMeta).toBe(true);
        calls.push({ ref, subPath: options?.subPath });

        return [
          { kind: 'directory', path: 'app/src' },
          { kind: 'file', path: 'app/src/index.ts', size: 42 },
          { kind: 'file', path: 'app/.env', size: 1 },
          { kind: 'file', path: 'app/node_modules/pkg/index.js', size: 12 },
          { kind: 'file', path: 'docs/outside.md', size: 24 },
        ];
      },
    };
    const reader = new FileSystemReader(
      new RemoteRepositoryFileSystemAdapter(
        {
          apiClient,
          branchOptions: [
            { name: 'main', default: true },
            { name: 'feature/docs' },
          ],
          repositoryUrl:
            'https://github.com/acme/project/tree/feature/docs/app',
        },
        {
          exclude: ['**/node_modules/**'],
          readFileMeta: true,
          showHidden: false,
        }
      )
    );
    const tree = await reader.read();
    const src = tree.children?.find(child => child.name === 'src');

    expect(calls).toEqual([{ ref: 'feature/docs', subPath: 'app' }]);
    expect(tree.name).toBe('app');
    expect(tree.children?.map(child => child.name)).toEqual(['src']);
    expect(src?.children?.map(child => child.name)).toEqual(['index.ts']);
    expect(src?.children?.[0]?.size).toBe(42);
  });

  it('reads remote repository adapters with explicit refs and runtime options', async () => {
    const abortController = new AbortController();
    const calls: Array<{
      readFileMeta: boolean | undefined;
      ref: string;
      signal: AbortSignal | undefined;
      subPath: string | undefined;
    }> = [];
    const apiClient: RemoteRepositoryApiClient = {
      async getDefaultBranch() {
        throw new Error('Default branch should not be requested');
      },
      async listBranches() {
        throw new Error('Branches should not be requested');
      },
      async listTreeEntries(parsedUrl, ref, options) {
        expect(parsedUrl.provider).toBe('gitlab');
        expect(parsedUrl.projectPath).toBe('group/sub/project');
        calls.push({
          readFileMeta: options?.readFileMeta,
          ref,
          signal: options?.signal,
          subPath: options?.subPath,
        });

        return [
          { kind: 'directory', path: 'src/features/.config' },
          {
            kind: 'file',
            path: 'src/features/.config/settings.json',
            size: 5,
          },
          { kind: 'directory', path: 'src/features/ui' },
          { kind: 'file', path: 'src/features/ui/index.ts', size: 11 },
          { kind: 'file', path: 'src/features/debug.map', size: 9 },
          { kind: 'file', path: 'src/other.ts', size: 3 },
        ];
      },
    };
    const reader = new FileSystemReader(
      new RemoteRepositoryFileSystemAdapter({
        apiClient,
        path: 'src/features',
        ref: 'release/v1',
        repositoryUrl: 'gitlab.com/group/sub/project.git',
        signal: abortController.signal,
      })
    );
    const tree = await reader.read({
      exclude: ['**/*.map'],
      readFileMeta: true,
      showHidden: true,
    });

    expect(calls).toEqual([
      {
        readFileMeta: true,
        ref: 'release/v1',
        signal: abortController.signal,
        subPath: 'src/features',
      },
    ]);
    expect(tree.name).toBe('features');
    expect(tree.children?.map(child => child.name)).toEqual(['.config', 'ui']);
    expect(tree.children?.[0]?.children?.[0]?.size).toBe(5);
    expect(tree.children?.[1]?.children?.[0]?.size).toBe(11);
  });
});

describe('tree utilities', () => {
  it('renames, creates, moves, and removes nodes without mutating the source', () => {
    const renamed = renameFileTreeNode(
      sampleTree,
      'project/src/index.ts',
      'main.ts'
    );

    expect(renamed?.toPath).toBe('project/src/main.ts');
    expect(sampleTree.children?.[0]?.children?.[0]?.path).toBe(
      'project/src/index.ts'
    );

    const created = createFileTreeNode(renamed!.tree, 'project/src', {
      kind: 'file',
      name: 'app.ts',
    });

    expect(created?.path).toBe('project/src/app.ts');

    const moved = moveFileTreeNode(created!.tree, 'project/src/app.ts', {
      parentPath: 'project',
      childIndex: null,
    });

    expect(moved?.toPath).toBe('project/app.ts');

    const removed = removeFileTreeNodes(moved!.tree, ['project/src/main.ts']);

    expect(removed?.children?.[0]?.children).toHaveLength(0);
  });

  it('creates visible and focused trees', () => {
    const visibleTree = createVisibleFileTree(sampleTree, {
      'project/src': 'children-hidden',
      'project/.env': 'hidden',
    });

    expect(visibleTree?.children?.map(child => child.path)).toEqual([
      'project/src',
      'project/README.md',
    ]);
    expect(visibleTree?.children?.[0]?.children).toEqual([]);

    const focusedTree = createFocusedFileTree(sampleTree, 'project/src');

    expect(focusedTree?.name).toBe('src');
    expect(focusedTree?.children?.[0]?.name).toBe('index.ts');
  });

  it('normalizes path lists, visibility maps, expanded state, and handles', () => {
    expect(
      filterNestedFileTreePaths([
        'project/src/index.ts',
        'project/src',
        'project/README.md',
        'project/src',
      ])
    ).toEqual(['project/README.md', 'project/src']);

    expect(
      filterFileTreeVisibilityByPaths(
        {
          'project/src': 'children-hidden',
          'project/missing': 'hidden',
        },
        ['project/src']
      )
    ).toEqual({ 'project/src': 'children-hidden' });

    expect(
      remapFileTreeVisibility(
        {
          'project/src': 'children-hidden',
          'project/src/index.ts': 'hidden',
        },
        'project/src',
        'project/app'
      )
    ).toEqual({
      'project/app': 'children-hidden',
      'project/app/index.ts': 'hidden',
    });

    expect(normalizeExpandedFileTreeItems(sampleTree, [])).toEqual(['project']);
    expect(
      collapseExpandedFileTreeItems(
        ['project', 'project/src', 'project/src/index.ts'],
        ['project/src'],
        true
      )
    ).toEqual(['project']);

    const chainTree: FileNode = {
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
              name: 'app',
              path: 'project/src/app',
              kind: 'directory',
              children: [
                {
                  name: 'index.ts',
                  path: 'project/src/app/index.ts',
                  kind: 'file',
                },
              ],
            },
          ],
        },
      ],
    };

    expect(getAutoExpandedFileTreeItems(chainTree)).toEqual([
      'project',
      'project/src',
      'project/src/app',
    ]);
    expect(
      remapExpandedFileTreeItemsAfterMove(
        sampleTree,
        ['project', 'project/src', 'project/src/index.ts'],
        'project/src',
        'project/app'
      )
    ).toEqual(['project']);

    const treeWithHandles: FileNode = {
      name: 'project',
      path: 'project',
      kind: 'directory',
      handle: { source: 'in-memory' },
      children: [
        {
          name: 'README.md',
          path: 'project/README.md',
          kind: 'file',
          handle: { source: 'in-memory' },
        },
      ],
    };

    expect(stripFileNodeHandles(treeWithHandles)).toEqual({
      name: 'project',
      path: 'project',
      kind: 'directory',
      children: [
        { name: 'README.md', path: 'project/README.md', kind: 'file' },
      ],
    });
  });
});
