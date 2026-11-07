import type { ParsedImportedTree } from './types';
import { FileTreeError } from '../reader/errors';
import { createImportedTreeNode } from '../reader/importedNode';
import type { TreeAnnotationMap } from '../annotations/types';
import type { FileNode } from '../reader/types';
import { appendImportedTreeAnnotation } from '../annotations/imported';

/**
 * Date: 2026-11-07
 * Desc: Builds a structural tree from normalized text entries
 */

export interface ImportedTreeEntry {
  comment: string | null;
  label: string;
  level: number;
  line?: number;
}

/**
 * Builds a file tree from leveled tree entries
 * @param entries Leveled entries describing nodes and indentation
 * @param fallbackRootName Root name used when the entries lack one
 * @returns Parsed tree and extracted annotations
 */
export function buildImportedTreeFromEntries(
  entries: ImportedTreeEntry[],
  fallbackRootName: string
): ParsedImportedTree {
  if (entries.length === 0) {
    throw new FileTreeError(
      'invalid_tree',
      'Imported content does not contain parseable tree nodes'
    );
  }

  const normalizedEntries = promoteSingleTopLevelEntry(
    entries,
    fallbackRootName
  );
  const rootEntry = normalizedEntries[0];
  const rootLabel = sanitizeNodeName(
    rootEntry?.label ?? fallbackRootName,
    fallbackRootName
  );
  // A leading dot denotes the displayed root, not a literal child name
  const rootName =
    rootLabel === '.'
      ? sanitizeNodeName(fallbackRootName, 'file-tree')
      : rootLabel;
  const paths = new Set<string>();
  const root = createImportedTreeNode(
    paths,
    rootName,
    'directory',
    '',
    rootEntry?.line
  );
  root.children = [];
  const annotations: TreeAnnotationMap = {};
  const stack: Array<{ level: number; node: FileNode }> = [
    { level: -1, node: root },
  ];

  appendImportedTreeAnnotation(
    annotations,
    root.path,
    rootEntry?.comment ?? null
  );

  normalizedEntries.slice(1).forEach((entry, index, childEntries) => {
    while (stack.length > 1 && stack[stack.length - 1]!.level >= entry.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.node;
    const nextEntry = childEntries[index + 1];
    const name = sanitizeNodeName(entry.label, fallbackRootName);
    const kind: FileNode['kind'] =
      entry.label.endsWith('/') || (nextEntry && nextEntry.level > entry.level)
        ? 'directory'
        : isLikelyFileName(name)
          ? 'file'
          : 'directory';
    const node = createImportedTreeNode(
      paths,
      name,
      kind,
      parent.path,
      entry.line
    );

    if (kind === 'directory') {
      node.children = [];
    }

    parent.children ??= [];
    parent.children.push(node);
    appendImportedTreeAnnotation(annotations, node.path, entry.comment);

    if (kind === 'directory') {
      stack.push({ level: entry.level, node });
    }
  });

  return { tree: root, annotations };
}

/**
 * Promotes a single top-level entry to the root, or synthesizes a root
 * @param entries Leveled tree entries
 * @param fallbackRootName Root name used when synthesizing a root
 * @returns Entries arranged so the first entry is the root
 */
function promoteSingleTopLevelEntry(
  entries: ImportedTreeEntry[],
  fallbackRootName: string
): ImportedTreeEntry[] {
  const topLevelEntries = entries.filter(entry => entry.level === 0);

  if (topLevelEntries.length !== 1) {
    return [
      { label: fallbackRootName, level: -1, comment: null },
      ...entries.map(entry => ({ ...entry, level: entry.level + 1 })),
    ];
  }

  const [firstEntry, ...restEntries] = entries;

  if (!firstEntry) {
    return [];
  }

  return [
    { ...firstEntry, level: -1 },
    ...restEntries.map(entry => ({
      ...entry,
      level: Math.max(0, entry.level - 1),
    })),
  ];
}

/**
 * Converts raw indentation widths into contiguous zero-based levels
 * @param entries Entries whose levels reflect raw indentation
 * @returns Entries with normalized nesting levels
 */
export function normalizeIndentLevels(
  entries: ImportedTreeEntry[]
): ImportedTreeEntry[] {
  const indentStack: number[] = [];

  return entries.map(entry => {
    while (
      indentStack.length > 0 &&
      entry.level < indentStack[indentStack.length - 1]!
    ) {
      indentStack.pop();
    }

    if (
      indentStack.length === 0 ||
      entry.level > indentStack[indentStack.length - 1]!
    ) {
      indentStack.push(entry.level);
    }

    return {
      ...entry,
      level: indentStack.length - 1,
    };
  });
}

/**
 * Heuristically determines whether a label looks like a file name
 * @param name Sanitized node name
 * @returns True when the name has a file-like extension or dot prefix
 */
function isLikelyFileName(name: string): boolean {
  return name.startsWith('.') || /\.[^./]+$/u.test(name);
}

/**
 * Cleans a raw node label into a safe single-segment name
 * @param value Raw label or path text
 * @param fallbackRootName Name used when sanitizing yields an empty string
 * @returns Sanitized node name
 */
export function sanitizeNodeName(
  value: string,
  fallbackRootName: string
): string {
  const normalizedValue = value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/\/+$/u, '');
  const segments = normalizedValue.split('/').filter(Boolean);
  const candidate = segments.at(-1) ?? normalizedValue;

  return candidate.replace(/[\\/:*?"<>|]/gu, '').trim() || fallbackRootName;
}
