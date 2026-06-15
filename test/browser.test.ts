import { describe, expect, it } from 'vitest';
import {
  isFileTreeSourceDrag,
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
