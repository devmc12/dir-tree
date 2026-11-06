import { describe, expect, it } from 'vitest';
import {
  isFileTreeSourceDrag,
  LocalFileSystemAdapter,
  resolveDroppedFileTreeSource,
} from '../src/browser';

/**
 * Date: 2026-06-07
 * Desc: Verifies browser-only file tree source helpers
 */

interface MockDataTransferItem {
  getAsFile: () => File | null;
  kind: string;
}

function createMockDataTransfer(
  files: File[],
  items: MockDataTransferItem[] = files.map(createMockFileItem)
): DataTransfer {
  return {
    files,
    items,
    types: files.length || items.length ? ['Files'] : [],
  } as unknown as DataTransfer;
}

function createMockFileItem(file: File): MockDataTransferItem {
  return {
    kind: 'file',
    getAsFile: () => file,
  };
}

describe('browser file tree source helpers', () => {
  it('detects file-backed drag payloads', () => {
    expect(isFileTreeSourceDrag(null)).toBe(false);
    expect(
      isFileTreeSourceDrag(
        createMockDataTransfer([new File(['x'], 'tree.txt')])
      )
    ).toBe(true);
  });

  it('resolves dropped ZIP and imported tree files', async () => {
    const zipResolution = await resolveDroppedFileTreeSource(
      createMockDataTransfer([
        new File(['zip'], 'archive.zip', { type: 'application/zip' }),
      ])
    );
    const markdownResolution = await resolveDroppedFileTreeSource(
      createMockDataTransfer([new File(['- project'], 'tree.md')])
    );

    expect(zipResolution).toMatchObject({
      status: 'success',
      source: { kind: 'zip', name: 'archive.zip' },
    });
    expect(markdownResolution).toMatchObject({
      status: 'success',
      source: { format: 'markdown-list', kind: 'import-file' },
    });
  });

  it('keeps native handles on selected sources without attaching them to nodes', async () => {
    const handle = {
      kind: 'directory',
      name: 'project',
      async *[Symbol.asyncIterator]() {
        yield ['notes.txt', { kind: 'file', name: 'notes.txt' }];
      },
    };
    const item = {
      kind: 'file',
      getAsFile: () => null,
      getAsFileSystemHandle: async () => handle,
    };
    const result = await resolveDroppedFileTreeSource(
      createMockDataTransfer([], [item])
    );

    if (result.status !== 'success' || result.source.kind !== 'directory') {
      throw new Error('Expected a directory source');
    }

    expect(result.source.handle).toBe(handle);
    const reader = new LocalFileSystemAdapter(
      { useGitignore: false },
      result.source.handle
    );
    const tree = await reader.read();

    expect(tree).not.toHaveProperty('handle');
    expect(tree.children).toEqual([
      { name: 'notes.txt', path: 'project/notes.txt', kind: 'file' },
    ]);
    expect(await reader.read()).toEqual(tree);
  });

  it('returns explicit statuses for empty and unsupported payloads', async () => {
    await expect(
      resolveDroppedFileTreeSource(createMockDataTransfer([]))
    ).resolves.toEqual({ status: 'empty' });
    await expect(
      resolveDroppedFileTreeSource(
        createMockDataTransfer([new File(['x'], 'image.png')])
      )
    ).resolves.toEqual({ status: 'unsupported-item' });
  });
});
