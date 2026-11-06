import type { FileNode, ReadOptions } from './types';
import { isPathExcluded } from './filters';
import { sortChildren } from './sort';

/**
 * Date: 2026-11-07
 * Desc: Copies structural file tree snapshots with read options
 */

/**
 * Copies a node's structural fields without children, indexes, or source data
 * @param node Source node
 * @param includeMetadata Whether to copy size, timestamp, and MIME type
 * @returns A new node containing only declared data fields
 */
export function copyFileNodeFields(
  node: FileNode,
  includeMetadata = true
): FileNode {
  const copy: FileNode = { name: node.name, path: node.path, kind: node.kind };

  if (includeMetadata) {
    if (node.size !== undefined) copy.size = node.size;
    if (node.lastModified !== undefined) copy.lastModified = node.lastModified;
    if (node.mimeType !== undefined) copy.mimeType = node.mimeType;
  }

  return copy;
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

  const nextNode = copyFileNodeFields(node, shouldIncludeMetadata);

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
