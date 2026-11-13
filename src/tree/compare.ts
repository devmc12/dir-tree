import type { FileNode, FileTreeItem } from '../reader/types';
import { createPathMap, getOwnValue } from './records';
import { getFileTreeItems } from './traversal';

/**
 * Date: 2026-11-14
 * Desc: Compares tree data and retains path state without host project policies
 */

export interface FileTreeChange {
  path: string;
  kind: 'added' | 'removed' | 'changed';
}

export interface FileTreeComparison {
  changes: FileTreeChange[];
  /** Paths present in both trees with the same node kind */
  matchingPaths: Set<string>;
}

/** Compares retained sibling order without counting insertions and removals on the parent */
function childrenReordered(before: FileNode, after: FileNode): boolean {
  const previous = before.children?.map(child => child.path) ?? [];
  const next = after.children?.map(child => child.path) ?? [];
  const previousPaths = new Set(previous);
  const nextPaths = new Set(next);
  const retained = previous.filter(path => nextPaths.has(path));
  const reordered = next.filter(path => previousPaths.has(path));
  return retained.some((path, index) => path !== reordered[index]);
}

/**
 * Compares paths, node kinds, metadata and retained sibling order
 * @param before Previous tree, or null for an empty source
 * @param after Next tree, or null for an empty source
 * @returns Changes and reusable matching paths from a single pair of indexes
 * Renames and moves are removals plus additions; no identity matching is guessed
 */
export function compareFileTrees(
  before: FileNode | null,
  after: FileNode | null
): FileTreeComparison {
  const previous = before
    ? getFileTreeItems(before)
    : createPathMap<FileTreeItem>();
  const next = after ? getFileTreeItems(after) : createPathMap<FileTreeItem>();
  const changes: FileTreeChange[] = [];
  const matchingPaths = new Set<string>();
  for (const [path, item] of Object.entries(previous)) {
    const node = getOwnValue(next, path)?.data;
    if (!node) changes.push({ path, kind: 'removed' });
    else {
      if (node.kind === item.data.kind) matchingPaths.add(path);
      if (
        node.kind !== item.data.kind ||
        node.size !== item.data.size ||
        node.lastModified !== item.data.lastModified ||
        childrenReordered(item.data, node)
      )
        changes.push({ path, kind: 'changed' });
    }
  }
  for (const path of Object.keys(next)) {
    if (!getOwnValue(previous, path)) changes.push({ path, kind: 'added' });
  }
  return { changes, matchingPaths };
}

/**
 * Keeps state for paths whose identity was retained by compareFileTrees
 * @param state Any annotation, visibility or host-owned map keyed by path
 * @param matchingPaths Matching paths reused across all state maps for this comparison
 * @returns A new map without inherited entries; values retain their references
 */
export function filterMatchingFileTreeState<T>(
  state: Record<string, T>,
  matchingPaths: ReadonlySet<string>
): Record<string, T> {
  const result = createPathMap<T>();
  for (const [path, value] of Object.entries(state)) {
    if (matchingPaths.has(path)) result[path] = value;
  }
  return result;
}
