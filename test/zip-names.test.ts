import { inflateSync, strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { ZipFileSystemAdapter } from '../src';

/**
 * Date: 2026-11-06
 * Desc: Verifies ZIP filename decoding and ignore rule content mapping
 */

vi.mock('fflate', { spy: true });

/**
 * Replaces a two-byte ASCII filename prefix with the GBK encoding of 中
 * @param archive ZIP using aa as the filename or directory prefix
 * @returns Archive with unchanged entry offsets and content checksums
 */
function withGbkNames(archive: Uint8Array): Uint8Array {
  const bytes = archive.slice();
  const view = new DataView(bytes.buffer);

  for (let index = 0; index + 46 <= bytes.length; index += 1) {
    const signature = view.getUint32(index, true);
    const nameOffset =
      signature === 0x04034b50
        ? index + 30
        : signature === 0x02014b50
          ? index + 46
          : null;

    if (
      nameOffset !== null &&
      bytes[nameOffset] === 97 &&
      bytes[nameOffset + 1] === 97
    ) {
      bytes[nameOffset] = 0xd6;
      bytes[nameOffset + 1] = 0xd0;
    }
  }

  return bytes;
}

/**
 * Creates a valid Info-ZIP Unicode path extra field including the original name CRC
 * @param originalName ASCII filename stored in the ZIP headers
 * @param unicodeName Display filename declared by the extra field
 * @returns Extra field payload excluding its ZIP header
 */
function unicodePathField(
  originalName: string,
  unicodeName: string
): Uint8Array {
  let crc = 0xffffffff;

  for (const byte of strToU8(originalName)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }

  const nameBytes = strToU8(unicodeName);
  const field = new Uint8Array(5 + nameBytes.length);
  field[0] = 1;
  new DataView(field.buffer).setUint32(1, (crc ^ 0xffffffff) >>> 0, true);
  field.set(nameBytes, 5);
  return field;
}

describe('ZIP filename content mapping', () => {
  it('inflates only reachable rules and reuses the Blob index and rule contents', async () => {
    const bytes = zipSync({
      'keep/data.bin': new Uint8Array(128 * 1024),
      'keep/.gitignore': strToU8('ignored.txt\n'),
      'keep/ignored.txt': strToU8('ignored'),
      'ignored/.gitignore': strToU8('unused.txt\n'),
      'ignored/unused.txt': strToU8('ignored parent'),
      '.gitignore': strToU8('ignored/\n'),
    });
    const source = new Blob([new Uint8Array(bytes)]);
    const readBytes = vi.spyOn(source, 'arrayBuffer');
    const inflate = vi.mocked(inflateSync);
    inflate.mockClear();
    const adapter = new ZipFileSystemAdapter(source);

    try {
      expect(
        (await adapter.read({ depth: 1 })).children?.map(node => node.name)
      ).toEqual(['keep']);
      expect(inflate).toHaveBeenCalledTimes(1);

      const tree = await adapter.read({ readFileMeta: true });
      expect(tree.children?.[0]?.children).toEqual([
        {
          name: 'data.bin',
          path: 'archive.zip/keep/data.bin',
          kind: 'file',
          size: 128 * 1024,
        },
      ]);
      expect(inflate).toHaveBeenCalledTimes(2);

      const withoutRules = await adapter.read({ useGitignore: false });
      expect(withoutRules.children?.map(node => node.name)).toEqual([
        'ignored',
        'keep',
      ]);
      expect(await adapter.read({ readFileMeta: true })).toEqual(tree);
      expect(inflate).toHaveBeenCalledTimes(2);
      expect(readBytes).toHaveBeenCalledTimes(1);
    } finally {
      inflate.mockClear();
      readBytes.mockRestore();
    }
  });

  it.each(['view', 'buffer'])(
    're-reads caller-owned bytes supplied as a %s',
    async kind => {
      const first = zipSync({ 'first.txt': strToU8('same') });
      const next = zipSync({ 'other.txt': strToU8('same') });
      const backing = new Uint8Array(first.length + (kind === 'view' ? 5 : 0));
      const bytes = kind === 'view' ? backing.subarray(5) : backing;
      bytes.set(first);
      const adapter = new ZipFileSystemAdapter(
        kind === 'view' ? bytes : backing.buffer
      );

      expect((await adapter.read()).children?.map(node => node.name)).toEqual([
        'first.txt',
      ]);
      bytes.set(next);
      expect((await adapter.read()).children?.map(node => node.name)).toEqual([
        'other.txt',
      ]);
    }
  );

  it.each([
    [
      'bad central record signature',
      (view: DataView, position: number) => view.setUint32(position, 0, true),
    ],
    [
      'truncated central entry',
      (view: DataView, position: number) =>
        view.setUint16(position + 28, 0xffff, true),
    ],
    [
      'out-of-range local data',
      (view: DataView, position: number) =>
        view.setUint32(position + 42, view.byteLength, true),
    ],
    [
      'unsupported compression',
      (view: DataView, position: number) =>
        view.setUint16(position + 10, 99, true),
    ],
    [
      'encrypted entry',
      (view: DataView, position: number) =>
        view.setUint16(position + 8, 1, true),
    ],
  ])('rejects ZIP indexes with %s', async (_, corrupt) => {
    const archive = zipSync({ 'ordinary.bin': strToU8('data') });
    const view = new DataView(
      archive.buffer,
      archive.byteOffset,
      archive.byteLength
    );
    const directory = view.getUint32(archive.length - 22 + 16, true);
    corrupt(view, directory);

    await expect(
      new ZipFileSystemAdapter(archive).read()
    ).rejects.toMatchObject({ code: 'invalid_zip' });
  });

  it('rejects a corrupt rule only when its directory is traversed', async () => {
    const archive = zipSync(
      {
        'dir/.gitignore': strToU8('ignored.txt'),
        'dir/ignored.txt': strToU8('file'),
      },
      { level: 0 }
    );
    const view = new DataView(
      archive.buffer,
      archive.byteOffset,
      archive.byteLength
    );
    const data = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    archive[data] = 0xff;
    const adapter = new ZipFileSystemAdapter(archive);

    await expect(adapter.read({ depth: 1 })).resolves.toMatchObject({
      children: [{ name: 'dir', children: [] }],
    });
    await expect(adapter.read()).rejects.toMatchObject({
      code: 'gitignore_read_failed',
      path: 'archive.zip/dir/.gitignore',
    });
  });

  it('rejects file and directory paths that overlap after normalization', async () => {
    const archive = zipSync({
      folder: strToU8('file'),
      'folder/child': strToU8('nested'),
    });

    await expect(
      new ZipFileSystemAdapter(archive).read()
    ).rejects.toMatchObject({
      code: 'invalid_zip',
      path: 'folder',
    });
  });

  it('rejects local ZIP ranges that overlap even when both are before the central directory', async () => {
    const archive = zipSync(
      { 'first.bin': strToU8('one'), 'second.bin': strToU8('two') },
      { level: 0 }
    );
    const view = new DataView(
      archive.buffer,
      archive.byteOffset,
      archive.byteLength
    );
    const central = view.getUint32(archive.length - 22 + 16, true);

    view.setUint32(central + 20, 4, true);
    view.setUint32(central + 24, 4, true);

    await expect(new ZipFileSystemAdapter(archive).read()).rejects.toThrow(
      'ZIP local entries overlap'
    );
  });

  it('ignores an end-record signature embedded in a ZIP comment', async () => {
    const source = zipSync({ 'file.txt': strToU8('text') });
    const commentLength = 22;
    const archive = new Uint8Array(source.length + commentLength);
    archive.set(source);
    const view = new DataView(archive.buffer);
    view.setUint16(source.length - 2, commentLength, true);
    view.setUint32(source.length, 0x06054b50, true);

    const tree = await new ZipFileSystemAdapter(archive).read();

    expect(tree.children?.map(node => node.name)).toEqual(['file.txt']);
  });

  it('retains GBK filenames and size metadata', async () => {
    const data = strToU8('abc');
    const archive = withGbkNames(zipSync({ 'aa.txt': data }));
    const tree = await new ZipFileSystemAdapter(
      archive,
      { readFileMeta: true },
      'project'
    ).read();

    expect(tree.children?.[0]).toMatchObject({
      name: '中.txt',
      path: 'project/中.txt',
      size: 3,
    });
  });

  it('loads nested gitignore files under GBK directory names', async () => {
    const archive = withGbkNames(
      zipSync({
        'aa/.gitignore': strToU8('ignored.txt\n'),
        'aa/ignored.txt': strToU8('hidden'),
        'aa/keep.txt': strToU8('retained'),
      })
    );
    const tree = await new ZipFileSystemAdapter(
      archive,
      { readFileMeta: true },
      'project'
    ).read();
    const folder = tree.children?.[0];

    expect(folder?.name).toBe('中');
    expect(folder?.children?.map(child => child.name)).toEqual(['keep.txt']);
    expect(folder?.children?.[0]?.size).toBe(8);
  });

  it('indexes Unicode path extra names using their original archive content keys', async () => {
    const data = strToU8('unicode path');
    const archive = zipSync({
      'plain.txt': [
        data,
        { extra: { 0x7075: unicodePathField('plain.txt', '中文.txt') } },
      ],
      'rules.txt': [
        strToU8('ignored.txt\n'),
        { extra: { 0x7075: unicodePathField('rules.txt', '.gitignore') } },
      ],
      'ignored.txt': strToU8('hidden'),
      'utf8-目录.txt': strToU8('UTF-8'),
      'empty.txt': new Uint8Array(),
    });
    const tree = await new ZipFileSystemAdapter(
      archive,
      { readFileMeta: true },
      'project'
    ).read();
    const byName = new Map(tree.children?.map(child => [child.name, child]));

    expect(byName.get('中文.txt')?.size).toBe(data.length);
    expect(byName.get('utf8-目录.txt')?.size).toBe(5);
    expect(byName.get('empty.txt')?.size).toBe(0);
    expect(byName.has('ignored.txt')).toBe(false);
  });

  it('rejects ambiguous decoded names instead of associating the wrong content', async () => {
    const archive = zipSync({
      'one.txt': [
        strToU8('one'),
        { extra: { 0x7075: unicodePathField('one.txt', 'same.txt') } },
      ],
      'two.txt': [
        strToU8('two'),
        { extra: { 0x7075: unicodePathField('two.txt', 'same.txt') } },
      ],
    });

    await expect(new ZipFileSystemAdapter(archive).read()).rejects.toThrow(
      'ambiguous duplicate filenames'
    );
  });
});
