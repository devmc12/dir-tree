import { inflateSync, strFromU8 } from 'fflate';
import { FileTreeError } from './errors';
import { getParentPath } from '../tree/path';

/**
 * Date: 2026-11-07
 * Desc: Indexes ZIP directory records and reads selected entry payloads
 */

export interface ZipEntry {
  path: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  compression: 0 | 8;
  checksum: number;
  dataOffset: number;
}

// Fixed ZIP record sizes and signatures from PKWARE APPNOTE sections 4.3.7–4.3.16
const LOCAL_HEADER = { signature: 0x04034b50, size: 30 };
const CENTRAL_HEADER = { signature: 0x02014b50, size: 46 };
const DIRECTORY_END = { signature: 0x06054b50, size: 22 };
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
// Traditional encryption, strong encryption, or masked local header values
const ENCRYPTION_FLAGS = 0x2041;

// Reuse decoders across entries without sharing the decoded archive data
const decoders = new Map<string, TextDecoder | null>();

/**
 * Returns a cached decoder when the runtime supports the encoding
 */
function getDecoder(encoding: string, fatal = false): TextDecoder | null {
  const key = `${encoding}:${fatal}`;

  if (!decoders.has(key)) {
    try {
      decoders.set(key, new TextDecoder(encoding, { fatal }));
    } catch {
      decoders.set(key, null);
    }
  }

  return decoders.get(key) ?? null;
}

/**
 * Computes the ZIP checksum used by entry data and Unicode path extra fields
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Reads a verified Info-ZIP Unicode path field while checking every extra record
 */
function readUnicodePath(
  nameBytes: Uint8Array,
  extraBytes: Uint8Array
): string | undefined {
  const view = new DataView(
    extraBytes.buffer,
    extraBytes.byteOffset,
    extraBytes.byteLength
  );
  let offset = 0;
  let unicodePath: string | undefined;

  while (offset < view.byteLength) {
    if (offset + 4 > view.byteLength) {
      throw new FileTreeError(
        'invalid_zip',
        'Truncated ZIP extra field header'
      );
    }

    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    const start = offset + 4;
    offset = start + size;

    if (offset > view.byteLength) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP extra field exceeds its entry'
      );
    }

    if (
      id === 0x7075 &&
      size >= 5 &&
      view.getUint8(start) === 1 &&
      view.getUint32(start + 1, true) === crc32(nameBytes)
    ) {
      try {
        unicodePath ??= getDecoder('utf-8', true)?.decode(
          extraBytes.subarray(start + 5, offset)
        );
      } catch {
        // An undecodable Unicode path leaves the original filename in use
      }
    }
  }

  return unicodePath;
}

/**
 * Decodes a display name using a verified extra path, UTF-8, or legacy encodings
 */
function decodeFilename(
  nameBytes: Uint8Array,
  isUtf8: boolean,
  extraBytes: Uint8Array
): string {
  const unicodePath = readUnicodePath(nameBytes, extraBytes);

  if (unicodePath !== undefined) {
    return unicodePath;
  }

  const utf8 = strFromU8(nameBytes);

  if (isUtf8 || !utf8.includes('\uFFFD')) {
    return utf8;
  }

  for (const encoding of [
    'gbk',
    'big5',
    'shift-jis',
    'euc-kr',
    'cp866',
    'windows-1251',
    'windows-1252',
  ]) {
    try {
      const decoded = getDecoder(encoding, true)?.decode(nameBytes);

      if (decoded !== undefined) {
        return decoded;
      }
    } catch {
      // Try the next encoding if this one rejects the original bytes
    }
  }

  return (
    getDecoder('iso-8859-1')?.decode(nameBytes) ?? strFromU8(nameBytes, true)
  );
}

/**
 * Finds the directory end record by matching its declared comment to the archive end
 */
function findDirectoryEnd(view: DataView): number {
  const scanStart = Math.max(0, view.byteLength - DIRECTORY_END.size - 0xffff);

  for (
    let offset = view.byteLength - DIRECTORY_END.size;
    offset >= scanStart;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) !== DIRECTORY_END.signature ||
      offset + DIRECTORY_END.size + view.getUint16(offset + 20, true) !==
        view.byteLength
    ) {
      continue;
    }

    const size = view.getUint32(offset + 12, true);
    const start = view.getUint32(offset + 16, true);

    // A comment can contain a second signature; check that the record has a plausible layout
    if (
      start + size === offset ||
      size === 0xffffffff ||
      start === 0xffffffff ||
      (offset >= 20 &&
        view.getUint32(offset - 20, true) === ZIP64_LOCATOR_SIGNATURE)
    ) {
      return offset;
    }
  }

  throw new FileTreeError(
    'invalid_zip',
    'Could not find the end of the ZIP central directory'
  );
}

/**
 * Resolves a central directory entry to its bounded local data range
 */
function getDataOffset(
  view: DataView,
  directoryOffset: number,
  localOffset: number,
  name: Uint8Array,
  compression: number,
  compressedSize: number
): number {
  const nameOffset = localOffset + LOCAL_HEADER.size;

  if (
    nameOffset > directoryOffset ||
    view.getUint32(localOffset, true) !== LOCAL_HEADER.signature
  ) {
    throw new FileTreeError('invalid_zip', 'Invalid ZIP local file header');
  }

  const localNameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = nameOffset + localNameLength + extraLength;

  if (
    localNameLength !== name.length ||
    dataOffset + compressedSize > directoryOffset ||
    view.getUint16(localOffset + 8, true) !== compression ||
    (view.getUint16(localOffset + 6, true) & ENCRYPTION_FLAGS) !== 0 ||
    name.some((byte, index) => view.getUint8(nameOffset + index) !== byte)
  ) {
    throw new FileTreeError(
      'invalid_zip',
      'ZIP local entry does not match its central directory record'
    );
  }

  return dataOffset;
}

/**
 * Validates and indexes a single-volume ZIP without reading ordinary file payloads
 * @param bytes Complete archive, which may be a view into a larger buffer
 * @returns Entries with decoded paths, byte sizes, and local data ranges
 * @throws FileTreeError for unsupported formats or inconsistent directory records
 */
export function parseCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findDirectoryEnd(view);
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);

  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count
  ) {
    throw new FileTreeError(
      'invalid_zip',
      'Split ZIP archives are not supported'
    );
  }

  if (
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    (directoryOffset + directorySize !== end &&
      end >= 20 &&
      view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIGNATURE)
  ) {
    throw new FileTreeError(
      'invalid_zip',
      'ZIP64 central directories are not supported'
    );
  }

  if (
    directoryOffset + directorySize !== end ||
    count * CENTRAL_HEADER.size > directorySize
  ) {
    throw new FileTreeError(
      'invalid_zip',
      'ZIP central directory is outside the expected bounds'
    );
  }

  const entries: ZipEntry[] = [];
  const paths = new Map<string, boolean>();
  const contentKeys = new Set<string>();
  const localRanges: Array<{ start: number; end: number }> = [];
  let position = directoryOffset;

  for (let index = 0; index < count; index += 1) {
    const nameOffset = position + CENTRAL_HEADER.size;

    if (
      nameOffset > end ||
      view.getUint32(position, true) !== CENTRAL_HEADER.signature
    ) {
      throw new FileTreeError(
        'invalid_zip',
        'Invalid ZIP central directory entry'
      );
    }

    const flags = view.getUint16(position + 8, true);
    const compression = view.getUint16(position + 10, true);
    const checksum = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const extraOffset = nameOffset + view.getUint16(position + 28, true);
    const extraEnd = extraOffset + view.getUint16(position + 30, true);
    const nextPosition = extraEnd + view.getUint16(position + 32, true);
    const disk = view.getUint16(position + 34, true);
    const attributes = view.getUint32(position + 38, true);
    const localOffset = view.getUint32(position + 42, true);

    if (nextPosition > end || disk !== 0) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP central directory entry exceeds its bounds or spans disks'
      );
    }

    if (
      localOffset === 0xffffffff ||
      size === 0xffffffff ||
      compressedSize === 0xffffffff
    ) {
      throw new FileTreeError('invalid_zip', 'ZIP64 entries are not supported');
    }

    if (
      (flags & ENCRYPTION_FLAGS) !== 0 ||
      (compression !== 0 && compression !== 8)
    ) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP entry uses encryption or an unsupported compression method'
      );
    }

    if (
      (compression === 0 && compressedSize !== size) ||
      (compression === 8 && compressedSize < 2)
    ) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP entry has inconsistent byte sizes'
      );
    }

    const nameBytes = bytes.subarray(nameOffset, extraOffset);
    const isUtf8 = (flags & 0x0800) !== 0;
    const name = decodeFilename(
      nameBytes,
      isUtf8,
      bytes.subarray(extraOffset, extraEnd)
    );
    const path = name.replace(/\/$/u, '');
    const isDir =
      name.endsWith('/') ||
      ((attributes >>> 16) & 0xf000) === 0x4000 ||
      (attributes & 0x10) !== 0;
    // Keep the original decoder key unambiguous even when an extra field changes the display path
    const contentKey = strFromU8(nameBytes, !isUtf8);

    if (
      path
        .split('/')
        .some(
          part => !part || part === '.' || part === '..' || part.includes('\0')
        )
    ) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP entry does not have a valid relative path',
        { path }
      );
    }

    if (paths.has(path) || contentKeys.has(contentKey)) {
      throw new FileTreeError(
        'invalid_zip',
        'ZIP entries contain ambiguous duplicate filenames',
        { path }
      );
    }

    const dataOffset = getDataOffset(
      view,
      directoryOffset,
      localOffset,
      nameBytes,
      compression,
      compressedSize
    );
    localRanges.push({ start: localOffset, end: dataOffset + compressedSize });
    paths.set(path, isDir);
    contentKeys.add(contentKey);
    entries.push({
      path,
      isDir,
      size,
      compressedSize,
      compression,
      checksum,
      dataOffset,
    });
    position = nextPosition;
  }

  if (position !== end) {
    throw new FileTreeError(
      'invalid_zip',
      'ZIP central directory size and entry count disagree'
    );
  }

  localRanges.sort((left, right) => left.start - right.start);
  let previousEnd = 0;

  for (const range of localRanges) {
    if (range.start < previousEnd) {
      throw new FileTreeError('invalid_zip', 'ZIP local entries overlap');
    }

    previousEnd = range.end;
  }

  for (const entry of entries) {
    for (
      let parent = getParentPath(entry.path);
      parent;
      parent = getParentPath(parent)
    ) {
      if (paths.get(parent) === false) {
        throw new FileTreeError(
          'invalid_zip',
          'A ZIP file entry cannot also be a directory',
          { path: parent }
        );
      }
    }
  }

  return entries;
}

/**
 * Reads and verifies the payload of one indexed text entry
 * @param bytes Archive containing the indexed range
 * @param entry Entry to decode, normally a gitignore file
 * @returns UTF-8 text from a stored or deflated entry
 * @throws FileTreeError when the payload disagrees with the index
 */
export function readZipEntryText(bytes: Uint8Array, entry: ZipEntry): string {
  const compressed = bytes.subarray(
    entry.dataOffset,
    entry.dataOffset + entry.compressedSize
  );
  const content =
    entry.compression === 0 ? compressed : inflateSync(compressed);

  if (content.length !== entry.size || crc32(content) !== entry.checksum) {
    throw new FileTreeError(
      'invalid_zip',
      'ZIP entry content does not match its size or checksum',
      { path: entry.path }
    );
  }

  return new TextDecoder('utf-8').decode(content);
}
