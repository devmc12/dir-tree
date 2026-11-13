import { createPathMap, getOwnValue } from './records';
import type { FileTreeVisibilityMap } from './types';
import { remapFileTreePathPrefix } from './path';
import type { FileNode } from '../reader/types';

/**
 * Date: 2026-11-07
 * Desc: Filters trees and remaps visibility settings
 */

/**
 * Keeps visibility entries that still point to valid paths
 * @param visibility Visibility map keyed by path
 * @param validPaths Iterable of paths that still exist
 * @returns Filtered visibility map
 */
export function filterFileTreeVisibilityByPaths(
  visibility: FileTreeVisibilityMap,
  validPaths: Iterable<string>
): FileTreeVisibilityMap {
  const pathSet = new Set(validPaths);
  const nextVisibility: FileTreeVisibilityMap = createPathMap();

  Object.entries(visibility).forEach(([path, mode]) => {
    if (pathSet.has(path)) {
      nextVisibility[path] = mode;
    }
  });

  return nextVisibility;
}

/**
 * Remaps all visibility paths after a subtree path changes
 * @param visibility Visibility map keyed by path
 * @param fromPath Previous subtree path
 * @param toPath New subtree path
 * @returns Visibility map with remapped keys
 */
export function remapFileTreeVisibility(
  visibility: FileTreeVisibilityMap,
  fromPath: string,
  toPath: string
): FileTreeVisibilityMap {
  const nextVisibility: FileTreeVisibilityMap = createPathMap();

  Object.entries(visibility).forEach(([path, mode]) => {
    nextVisibility[remapFileTreePathPrefix(path, fromPath, toPath)] = mode;
  });

  return nextVisibility;
}

/**
 * Creates a filtered tree that omits hidden nodes and collapsed children
 * @param root Source tree root
 * @param visibility Visibility map keyed by path
 * @returns Visible tree, or null when the root is hidden
 */
export function createVisibleFileTree(
  root: FileNode,
  visibility: FileTreeVisibilityMap
): FileNode | null {
  /**
   * Recursively applies visibility rules to one node
   * @param node Node to filter
   * @returns Visible node clone, or null when hidden
   */
  function filterVisibleNode(node: FileNode): FileNode | null {
    const visibilityMode = getOwnValue(visibility, node.path);

    if (visibilityMode === 'hidden') {
      return null;
    }

    if (node.kind !== 'directory') {
      return { ...node };
    }

    if (visibilityMode === 'children-hidden') {
      return {
        ...node,
        children: [],
      };
    }

    const nextNode: FileNode = { ...node };

    nextNode.children = (node.children ?? [])
      .map(filterVisibleNode)
      .filter((child): child is FileNode => child !== null);

    return nextNode;
  }

  return filterVisibleNode(root);
}

/**
 * Resolves effective node visibility in one traversal, including hidden ancestors
 * @param root Complete tree, independent of expanded rows and focused views
 * @param visibility Explicit hidden and children-hidden rules
 * @returns Whether each node is omitted from output; children-hidden keeps the folder itself visible
 */
export function createFileTreeHiddenLookup(
  root: FileNode,
  visibility: FileTreeVisibilityMap
): Record<string, boolean> {
  const hidden = createPathMap<boolean>();
  const stack = [{ node: root, ancestorHidden: false }];
  while (stack.length) {
    const { node, ancestorHidden } = stack.pop()!;
    const mode = getOwnValue(visibility, node.path);
    hidden[node.path] = ancestorHidden || mode === 'hidden';
    const childrenHidden = hidden[node.path] || mode === 'children-hidden';
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--) {
      stack.push({
        node: node.children![index]!,
        ancestorHidden: childrenHidden,
      });
    }
  }
  return hidden;
}
