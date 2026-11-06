import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ZipFileSystemAdapter } from '../src';

/**
 * Date: 2026-11-06
 * Desc: Verifies ZIP filename decoding and ignore rule content mapping
 */

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
