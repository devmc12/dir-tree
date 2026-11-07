import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileSystemReader,
  InMemoryFileTreeAdapter,
  RemoteRepositoryFileSystemAdapter,
  ZipFileSystemAdapter,
  type ReadTiming,
  type ReaderAdapter,
  type RemoteRepositoryApiClient,
} from '../src';
import {
  DroppedDirectoryEntryAdapter,
  LegacyDirectoryFilesAdapter,
  LocalFileSystemAdapter,
} from '../src/browser';
import { NodeFileSystemAdapter } from '../src/node';

/**
 * Date: 2026-11-07
 * Desc: Verifies optional per-read timing and source acquisition boundaries
 */

let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Creates a controllable async boundary without waiting on real time */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** Creates a directory whose enumeration can simulate filesystem work */
function createDirectory(onRead: () => void | Promise<void> = () => {}) {
  return {
    name: 'project',
    kind: 'directory',
    async *[Symbol.asyncIterator]() {
      await onRead();
      yield ['file.txt', { kind: 'file', name: 'file.txt' }];
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('read timing', () => {
  it('separates native selection from tree I/O and reuses the handle on refresh', async () => {
    const handle = createDirectory(() => {
      now += 40;
    });
    const showDirectoryPicker = vi.fn(async () => {
      now += 12000;
      return handle;
    });
    vi.stubGlobal('window', { showDirectoryPicker });
    const onTiming = vi.fn();
    const adapter = new LocalFileSystemAdapter({ useGitignore: false });
    const reader = new FileSystemReader(adapter);

    const tree = await reader.read({ onTiming });
    expect(onTiming).toHaveBeenCalledExactlyOnceWith({
      prepareMs: 12000,
      treeMs: 40,
      totalMs: 12040,
    });
    expect(tree.children?.[0]?.name).toBe('file.txt');
    expect(tree).not.toHaveProperty('timing');

    await expect(reader.read({ onTiming })).resolves.toEqual(tree);
    expect(onTiming).toHaveBeenLastCalledWith({
      prepareMs: 0,
      treeMs: 40,
      totalMs: 40,
    });
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
  });

  it('includes default branch and tree requests in repository preparation', async () => {
    const apiClient: RemoteRepositoryApiClient = {
      getDefaultBranch: vi.fn(async () => {
        now += 250;
        return 'main';
      }),
      listBranches: vi.fn(async () => []),
      listTreeEntries: vi.fn(async () => {
        now += 750;
        return [
          {
            kind: 'file' as const,
            get path() {
              now += 40;
              return 'file.txt';
            },
          },
        ];
      }),
    };
    const adapter = new RemoteRepositoryFileSystemAdapter({
      repositoryUrl: 'https://github.com/acme/project',
      apiClient,
    });
    const onTiming = vi.fn();

    const tree = await adapter.read({ onTiming });
    expect(tree.children?.[0]?.name).toBe('file.txt');
    expect(onTiming).toHaveBeenCalledExactlyOnceWith({
      prepareMs: 1000,
      treeMs: 40,
      totalMs: 1040,
    });
    expect(apiClient.getDefaultBranch).toHaveBeenCalledTimes(1);
    expect(apiClient.listTreeEntries).toHaveBeenCalledTimes(1);
    expect(apiClient.listBranches).not.toHaveBeenCalled();
  });

  it('preserves per-call callback overrides without retaining them', async () => {
    const defaultTiming = vi.fn();
    const temporaryTiming = vi.fn();
    const adapter = new LocalFileSystemAdapter(
      { useGitignore: false, onTiming: defaultTiming },
      createDirectory()
    );

    await adapter.read();
    await adapter.read({ onTiming: temporaryTiming });
    await adapter.read();
    expect(defaultTiming).toHaveBeenCalledTimes(2);
    expect(temporaryTiming).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent reads independent even when they finish out of order', async () => {
    const started = [deferred<void>(), deferred<void>()];
    const release = [deferred<void>(), deferred<void>()];
    let reads = 0;
    const adapter = new LocalFileSystemAdapter(
      { useGitignore: false },
      createDirectory(async () => {
        const index = reads++;
        started[index]!.resolve();
        await release[index]!.promise;
      })
    );
    const firstTiming = vi.fn();
    const secondTiming = vi.fn();
    const first = adapter.read({ onTiming: firstTiming });
    await started[0]!.promise;
    now = 10;
    const second = adapter.read({ onTiming: secondTiming });
    await started[1]!.promise;
    now = 30;
    release[1]!.resolve();
    await second;
    now = 60;
    release[0]!.resolve();
    await first;

    expect(firstTiming).toHaveBeenCalledExactlyOnceWith({
      prepareMs: 0,
      treeMs: 60,
      totalMs: 60,
    });
    expect(secondTiming).toHaveBeenCalledExactlyOnceWith({
      prepareMs: 0,
      treeMs: 20,
      totalMs: 20,
    });
  });

  it('shares one pending picker while measuring each caller from its own start', async () => {
    const pick = deferred<FileSystemDirectoryHandle>();
    const showDirectoryPicker = vi.fn(() => pick.promise);
    vi.stubGlobal('window', { showDirectoryPicker });
    const adapter = new LocalFileSystemAdapter({ useGitignore: false });
    const firstTiming = vi.fn();
    const secondTiming = vi.fn();
    const first = adapter.read({ onTiming: firstTiming });
    now = 100;
    const second = adapter.read({ onTiming: secondTiming });
    now = 12000;
    pick.resolve(createDirectory());
    await Promise.all([first, second]);

    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(firstTiming.mock.calls[0]?.[0].prepareMs).toBe(12000);
    expect(secondTiming.mock.calls[0]?.[0].prepareMs).toBe(11900);
  });

  it.each(['AbortError', 'NotAllowedError'])(
    'does not report %s and allows a later retry',
    async name => {
      const error = new DOMException('Selection failed', name);
      const showDirectoryPicker = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(createDirectory());
      vi.stubGlobal('window', { showDirectoryPicker });
      const adapter = new LocalFileSystemAdapter({ useGitignore: false });
      const onTiming = vi.fn();

      await expect(adapter.read({ onTiming })).rejects.toMatchObject(
        name === 'AbortError' ? { name } : { code: 'read_failed' }
      );
      expect(onTiming).not.toHaveBeenCalled();
      await adapter.read({ onTiming });
      expect(onTiming).toHaveBeenCalledTimes(1);
      expect(showDirectoryPicker).toHaveBeenCalledTimes(2);
    }
  );

  it('does not report an invalid ZIP or repository request failure', async () => {
    const onTiming = vi.fn();
    await expect(
      new ZipFileSystemAdapter(new Uint8Array()).read({ onTiming })
    ).rejects.toMatchObject({ code: 'invalid_zip' });
    const requestError = new Error('Request failed');
    const apiClient: RemoteRepositoryApiClient = {
      getDefaultBranch: async () => 'main',
      listBranches: async () => [],
      listTreeEntries: async () => {
        throw requestError;
      },
    };
    await expect(
      new RemoteRepositoryFileSystemAdapter({
        repositoryUrl: 'https://github.com/acme/project',
        apiClient,
      }).read({ onTiming })
    ).rejects.toBe(requestError);
    expect(onTiming).not.toHaveBeenCalled();
  });

  it('excludes callback work and isolates synchronous callback errors', async () => {
    const adapter = new LocalFileSystemAdapter(
      { useGitignore: false },
      createDirectory(() => {
        now += 40;
      })
    );
    let measured: ReadTiming | undefined;
    const tree = await adapter.read({
      onTiming: timing => {
        measured = timing;
        now += 500;
      },
    });
    expect(measured).toEqual({ prepareMs: 0, treeMs: 40, totalMs: 40 });

    const callbackError = new Error('Caller error');
    const onTiming = vi.fn(() => {
      throw callbackError;
    });
    await expect(adapter.read({ onTiming })).resolves.toEqual(tree);
    expect(onTiming).toHaveBeenCalledTimes(1);
    await expect(adapter.read()).resolves.toEqual(tree);
  });

  it('keeps existing custom adapters valid without fabricating their timing', async () => {
    const tree = {
      name: 'project',
      path: 'project',
      kind: 'directory' as const,
    };
    const adapter: ReaderAdapter = { read: async () => tree };
    const onTiming = vi.fn();
    await expect(
      new FileSystemReader(adapter).read({ onTiming })
    ).resolves.toBe(tree);
    expect(onTiming).not.toHaveBeenCalled();
  });

  it('measures ready sources without adding I/O or reading the clock when disabled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dir-tree-timing-'));
    try {
      await writeFile(join(directory, 'file.txt'), 'contents');
      const file = new File(['contents'], 'file.txt');
      Object.defineProperty(file, 'webkitRelativePath', {
        value: 'project/file.txt',
      });
      const blob = new Blob([
        zipSync({ 'file.txt': strToU8('contents') }).buffer as ArrayBuffer,
      ]);
      const arrayBuffer = vi.spyOn(blob, 'arrayBuffer');
      const adapters: ReaderAdapter[] = [
        new NodeFileSystemAdapter(directory, { useGitignore: false }),
        new ZipFileSystemAdapter(blob),
        new LegacyDirectoryFilesAdapter([file], { useGitignore: false }),
        new DroppedDirectoryEntryAdapter(
          {
            name: 'project',
            isDirectory: true,
            isFile: false,
            createReader() {
              const batches = [
                [
                  {
                    name: 'file.txt',
                    isDirectory: false as const,
                    isFile: true as const,
                    file: (done: (file: File) => void) => done(file),
                  },
                ],
                [],
              ];
              return { readEntries: done => done(batches.shift() ?? []) };
            },
          },
          { useGitignore: false }
        ),
        new InMemoryFileTreeAdapter({
          name: 'project',
          path: 'project',
          kind: 'directory',
        }),
      ];

      for (const adapter of adapters) {
        const clock = vi.mocked(performance.now);
        clock.mockClear();
        const baseline = await adapter.read();
        expect(clock).not.toHaveBeenCalled();
        const onTiming = vi.fn();
        clock.mockReturnValueOnce(0).mockReturnValueOnce(80);
        await expect(adapter.read({ onTiming })).resolves.toEqual(baseline);
        expect(onTiming).toHaveBeenCalledExactlyOnceWith({
          prepareMs: 0,
          treeMs: 80,
          totalMs: 80,
        });
        expect(clock).toHaveBeenCalledTimes(2);
      }
      expect(arrayBuffer).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
