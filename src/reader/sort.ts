import type { FileNode, SortOptions } from './types';

/**
 * Date: 2026-11-07
 * Desc: Sorts and depth-prunes directory children
 */

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
