import type {
  FileNode,
  FileTreeItem,
  FileTreeMetadata,
  GitignoreRule,
  ReadOptions,
  SortOptions,
  ZipEntry,
} from './types';
import { fileTreeMetadataKey } from './types';

/**
 * Date: 2026-06-07
 * Desc: Provides reusable reader filtering, sorting, ZIP, and metadata helpers
 */

// Text decoder cache keyed by encoding and fatal mode
const decoders: Record<string, TextDecoder | null> = {};

// Glob expression cache keyed by raw glob pattern
const globRegexCache = new Map<string, RegExp>();

// Exclude pattern regex cache keyed by pattern list
const excludePatternRegexCache = new Map<string, RegExp[]>();

/**
 * Returns a cached TextDecoder when the runtime supports the encoding
 * @param encoding Text encoding name
 * @param fatal Whether decoder errors should throw
 * @returns Cached decoder, or null when unavailable
 */
function getDecoder(encoding: string, fatal = false): TextDecoder | null {
  const key = `${encoding}:${fatal}`;

  if (!(key in decoders)) {
    try {
      decoders[key] = new TextDecoder(encoding, { fatal });
    } catch {
      decoders[key] = null;
    }
  }

  return decoders[key] ?? null;
}

/**
 * Returns a decoder or throws when the encoding is unavailable
 * @param encoding Text encoding name
 * @param fatal Whether decoder errors should throw
 * @returns Supported TextDecoder instance
 */
function getRequiredDecoder(encoding: string, fatal = false): TextDecoder {
  const decoder = getDecoder(encoding, fatal);

  if (decoder) {
    return decoder;
  }

  throw new Error(`TextDecoder for "${encoding}" is unavailable`);
}

/**
 * Decodes a ZIP entry filename using Unicode path fields and encoding fallbacks
 * @param nameBytes Raw filename bytes from the central directory
 * @param isUtf8Flag Whether the entry flags declare UTF-8 names
 * @param extraBytes Extra field bytes that may contain a Unicode path
 * @returns Decoded filename
 */
export function decodeFilename(
  nameBytes: Uint8Array,
  isUtf8Flag: boolean,
  extraBytes: Uint8Array | null
): string {
  if (extraBytes && extraBytes.length >= 4) {
    const view = new DataView(
      extraBytes.buffer,
      extraBytes.byteOffset,
      extraBytes.byteLength
    );
    let offset = 0;

    while (offset + 4 <= extraBytes.length) {
      const headerId = view.getUint16(offset, true);
      const dataSize = view.getUint16(offset + 2, true);

      if (headerId === 0x7075 && dataSize >= 5) {
        const utf8Name = extraBytes.subarray(
          offset + 4 + 1 + 4,
          offset + 4 + dataSize
        );

        try {
          return getRequiredDecoder('utf-8', true).decode(utf8Name);
        } catch {
          // Continue with fallback decoders when the Unicode path field fails
        }
      }

      offset += 4 + dataSize;
    }
  }

  if (isUtf8Flag) {
    return getRequiredDecoder('utf-8').decode(nameBytes);
  }

  const hasHighByte = nameBytes.some(byte => byte > 0x7f);

  if (!hasHighByte) {
    return getRequiredDecoder('ascii').decode(nameBytes);
  }

  const utf8Candidate = getRequiredDecoder('utf-8').decode(nameBytes);

  if (!utf8Candidate.includes('\uFFFD')) {
    return utf8Candidate;
  }

  const fallbackEncodings = [
    'gbk',
    'big5',
    'shift-jis',
    'euc-kr',
    'cp866',
    'windows-1251',
    'windows-1252',
  ];

  for (const encoding of fallbackEncodings) {
    const decoder = getDecoder(encoding, true);

    if (!decoder) {
      continue;
    }

    try {
      return decoder.decode(nameBytes);
    } catch {
      // Continue with the next decoder
    }
  }

  return getRequiredDecoder('iso-8859-1').decode(nameBytes);
}

/**
 * Parses ZIP central directory entries from an archive buffer
 * @param arrayBuffer Full ZIP archive buffer
 * @returns Parsed entries, or null when the central directory is not found
 */
export function parseCentralDirectory(
  arrayBuffer: ArrayBufferLike
): ZipEntry[] | null {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const length = bytes.length;
  const scanStart = Math.max(0, length - 65557);
  let eocdOffset = -1;

  for (let index = length - 22; index >= scanStart; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset === -1) {
    return null;
  }

  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let position = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  while (position < centralDirectoryEnd && position + 46 <= length) {
    if (view.getUint32(position, true) !== 0x02014b50) {
      break;
    }

    const flags = view.getUint16(position + 8, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const externalAttributes = view.getUint32(position + 38, true);
    const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength);
    const extraBytes =
      extraLength > 0
        ? bytes.subarray(
            position + 46 + nameLength,
            position + 46 + nameLength + extraLength
          )
        : null;
    const name = decodeFilename(nameBytes, (flags & 0x0800) !== 0, extraBytes);
    const isDir =
      name.endsWith('/') || ((externalAttributes >> 16) & 0x4000) !== 0;

    entries.push({ name, isDir, localOffset });
    position += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Compiles a glob pattern into a cached regular expression
 * @param glob Glob pattern using * and ? wildcards
 * @returns Regular expression matching paths against the glob
 */
export function globToRegex(glob: string): RegExp {
  const cachedRegex = globRegexCache.get(glob);

  if (cachedRegex) {
    return cachedRegex;
  }

  const normalized = glob.replace(/\\/gu, '/').replace(/^\.?\//u, '');
  let source = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];
    const followingCharacter = normalized[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (followingCharacter === '/') {
        source += '(?:.*/)?';
        index += 2;
        continue;
      }

      source += '.*';
      index += 1;
      continue;
    }

    if (character === '*') {
      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExpCharacter(character ?? '');
  }

  source = normalized.includes('/') ? `^${source}` : `(^|.*/)${source}`;
  source = `${source}(/.*)?$`;

  const regex = new RegExp(source);
  globRegexCache.set(glob, regex);

  return regex;
}

/**
 * Escapes a single character for use inside a regular expression
 * @param character Character to escape
 * @returns Escaped character text
 */
function escapeRegExpCharacter(character: string): string {
  return /[.+^${}()|[\]\\]/u.test(character) ? `\\${character}` : character;
}

/**
 * Runs async tasks with a bounded concurrency limit
 * @param tasks Task factories to execute
 * @param limit Maximum number of tasks running at once
 * @returns Task results in their original order
 */
export async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let index = 0;

  /**
   * Runs tasks from the shared queue until no tasks remain
   */
  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index;
      const task = tasks[currentIndex];
      index += 1;

      if (!task) {
        continue;
      }

      results[currentIndex] = await task();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );

  return results;
}

/**
 * Parses gitignore content into compiled ignore rules
 * @param content Raw gitignore file content
 * @param baseDir Tree-relative directory the rules are anchored to
 * @returns Compiled gitignore rules
 */
export function parseGitignore(
  content: string,
  baseDir: string
): GitignoreRule[] {
  const rules: GitignoreRule[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    let pattern = line;
    let negate = false;

    if (pattern.startsWith('!')) {
      negate = true;
      pattern = pattern.slice(1);
    }

    pattern = pattern.replace(/\/$/u, '');

    const isAnchored = pattern.startsWith('/');
    const normalizedPattern = pattern.replace(/^\//u, '');
    const hasPathSeparator = normalizedPattern.includes('/');
    const relativePattern =
      isAnchored || hasPathSeparator
        ? normalizedPattern
        : `**/${normalizedPattern}`;
    const fullPattern = baseDir
      ? `${baseDir}/${relativePattern}`
      : relativePattern;

    try {
      rules.push({ negate, regex: globToRegex(fullPattern) });
    } catch {
      // Ignore invalid ignore patterns
    }
  }

  return rules;
}

/**
 * Formats a byte count into a human-readable size string
 * @param bytes Size in bytes
 * @returns Size formatted with a B, KB, MB, or GB unit
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Builds path-indexed metadata, folder paths, and aggregate stats for a tree
 * @param root Root file node to traverse
 * @returns File tree metadata with items, folder paths, and stats
 */
export function buildFileTreeMetadata(root: FileNode): FileTreeMetadata {
  const itemsByPath: Record<string, FileTreeItem> = {};
  const folderPaths = new Set<string>();
  const stack: FileNode[] = [root];
  let totalFiles = 0;
  let totalDirs = 0;
  let totalSize = 0;

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node) {
      continue;
    }

    const isFolder = node.kind === 'directory';
    const item: FileTreeItem = {
      index: node.path,
      data: node,
      isFolder,
    };

    if (isFolder) {
      item.children = node.children?.map(child => child.path) ?? [];
    }

    itemsByPath[node.path] = item;
    totalSize += node.size ?? 0;

    if (isFolder) {
      totalDirs += 1;
      folderPaths.add(node.path);
    } else {
      totalFiles += 1;
    }

    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index];

      if (child) {
        stack.push(child);
      }
    }
  }

  return {
    itemsByPath,
    folderPaths,
    stats: {
      totalFiles,
      totalDirs,
      totalSize,
    },
  };
}

/**
 * Builds tree metadata and attaches it to the root as non-enumerable data
 * @param root Root file node to annotate
 * @returns Metadata that was attached to the root
 */
export function attachFileTreeMetadata(root: FileNode): FileTreeMetadata {
  const metadata = buildFileTreeMetadata(root);

  Object.defineProperty(root, fileTreeMetadataKey, {
    value: metadata,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  return metadata;
}

/**
 * Reads previously attached file tree metadata from a root node
 * @param root Root file node, or null or undefined
 * @returns Attached metadata, or undefined when none is present
 */
export function getFileTreeMetadata(
  root: FileNode | null | undefined
): FileTreeMetadata | undefined {
  return root?.[fileTreeMetadataKey];
}

/**
 * Builds a stable cache key for an exclude pattern list
 * @param excludePatterns Exclude glob patterns
 * @returns Cache key for the pattern list
 */
function getExcludePatternCacheKey(excludePatterns: string[]): string {
  return excludePatterns.join('\u0000');
}

/**
 * Returns cached regular expressions for exclude patterns
 * @param excludePatterns Exclude glob patterns
 * @returns Compiled regular expressions
 */
function getExcludePatternRegexes(excludePatterns: string[]): RegExp[] {
  const cacheKey = getExcludePatternCacheKey(excludePatterns);
  const cachedRegexes = excludePatternRegexCache.get(cacheKey);

  if (cachedRegexes) {
    return cachedRegexes;
  }

  const regexes = excludePatterns.map(pattern => globToRegex(pattern));
  excludePatternRegexCache.set(cacheKey, regexes);

  return regexes;
}

/**
 * Returns the parent path of a tree path
 * @param path Tree path to inspect
 * @returns Parent path, or an empty string for top-level paths
 */
export function getParentPath(path: string): string {
  const slashIndex = path.lastIndexOf('/');

  return slashIndex === -1 ? '' : path.substring(0, slashIndex);
}

/**
 * Checks whether a path matches any exclude pattern
 * @param fullPath Path to test
 * @param excludePatterns Exclude glob patterns
 * @returns True when the path matches an exclude pattern
 */
export function isPathExcluded(
  fullPath: string,
  excludePatterns: string[]
): boolean {
  return getExcludePatternRegexes(excludePatterns).some(regex =>
    regex.test(fullPath)
  );
}

/**
 * Clones a tree snapshot while applying read options and filtering
 * @param root Source tree to clone
 * @param options Read options controlling depth, filtering, and metadata
 * @param metadataMode Default metadata inclusion when options omit readFileMeta
 * @returns Filtered clone of the source tree
 */
export function createFileTreeFromSnapshot(
  root: FileNode,
  options: ReadOptions = {},
  metadataMode: 'default-on' | 'default-off' = 'default-off'
): FileNode {
  const clonedNode = cloneFileTreeSnapshotNode(root, options, metadataMode, 0);

  if (clonedNode) {
    return clonedNode;
  }

  const fallbackNode: FileNode = {
    name: root.name,
    path: root.path,
    kind: root.kind,
  };

  if (root.kind === 'directory') {
    fallbackNode.children = [];
  }

  return fallbackNode;
}

/**
 * Recursively clones a snapshot node while applying read filters
 * @param node Source node to clone
 * @param options Read options controlling filtering and metadata
 * @param metadataMode Default metadata inclusion mode
 * @param currentDepth Current recursion depth
 * @returns Cloned node, or null when filtered out
 */
function cloneFileTreeSnapshotNode(
  node: FileNode,
  options: ReadOptions,
  metadataMode: 'default-on' | 'default-off',
  currentDepth: number
): FileNode | null {
  const isRoot = currentDepth === 0;
  const showHidden = options.showHidden ?? false;
  const excludePatterns = options.exclude ?? [];
  const shouldIncludeMetadata =
    options.readFileMeta ?? metadataMode === 'default-on';

  if (
    !isRoot &&
    ((!showHidden && node.name.startsWith('.')) ||
      isPathExcluded(node.path, excludePatterns))
  ) {
    return null;
  }

  const nextNode: FileNode = {
    name: node.name,
    path: node.path,
    kind: node.kind,
  };

  if (shouldIncludeMetadata && node.size !== undefined) {
    nextNode.size = node.size;
  }

  if (shouldIncludeMetadata && node.lastModified !== undefined) {
    nextNode.lastModified = node.lastModified;
  }

  if (shouldIncludeMetadata && node.mimeType !== undefined) {
    nextNode.mimeType = node.mimeType;
  }

  if (node.kind !== 'directory') {
    return nextNode;
  }

  const maxDepth = options.depth ?? Infinity;
  const children =
    currentDepth >= maxDepth
      ? []
      : (node.children ?? [])
          .map(child =>
            cloneFileTreeSnapshotNode(
              child,
              options,
              metadataMode,
              currentDepth + 1
            )
          )
          .filter((child): child is FileNode => child !== null);

  sortChildren(children, options.sort);
  nextNode.children = children;

  return nextNode;
}

/**
 * Sorts child nodes in place by name or type with optional folders-first ordering
 * @param children Child nodes to sort
 * @param options Sort field, order, and folders-first preference
 */
export function sortChildren(
  children: FileNode[],
  options?: SortOptions
): void {
  const { sortBy = 'name', order = 'asc', foldersFirst = true } = options ?? {};

  /**
   * Extracts a lowercase extension for type sorting
   * @param name File or directory name
   * @returns Extension text, or an empty string
   */
  const getExtension = (name: string): string => {
    const dotIndex = name.lastIndexOf('.');

    return dotIndex === -1 || dotIndex === 0
      ? ''
      : name.slice(dotIndex + 1).toLowerCase();
  };

  children.sort((leftNode, rightNode) => {
    if (foldersFirst && leftNode.kind !== rightNode.kind) {
      return leftNode.kind === 'directory' ? -1 : 1;
    }

    let result: number;

    if (sortBy === 'type') {
      const leftExtension = getExtension(leftNode.name);
      const rightExtension = getExtension(rightNode.name);

      result =
        leftExtension === rightExtension
          ? (leftNode.lastModified ?? 0) - (rightNode.lastModified ?? 0)
          : leftExtension.localeCompare(rightExtension, undefined, {
              sensitivity: 'base',
            });
    } else {
      result = leftNode.name.localeCompare(rightNode.name, undefined, {
        sensitivity: 'base',
      });
    }

    return order === 'desc' ? -result : result;
  });
}

/**
 * Prunes a tree by depth and sorts directory children in place
 * @param node Current node to process
 * @param currentDepth Current recursion depth
 * @param maxDepth Maximum depth to retain
 * @param sort Optional sort configuration
 */
export function pruneAndSortTree(
  node: FileNode,
  currentDepth: number,
  maxDepth: number,
  sort?: SortOptions
): void {
  if (node.kind === 'file') {
    return;
  }

  if (currentDepth >= maxDepth) {
    node.children = [];
    return;
  }

  if (!node.children) {
    return;
  }

  sortChildren(node.children, sort);

  node.children.forEach(child => {
    pruneAndSortTree(child, currentDepth + 1, maxDepth, sort);
  });
}
