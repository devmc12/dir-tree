import type { FileNode } from '../reader/types';
import { getFileTreeFolderPaths } from './traversal';
import { isFileTreePathWithin, remapFileTreePathPrefix } from './path';

/**
 * Date: 2026-11-07
 * Desc: Normalizes and updates expanded directory paths
 */

/**
 * Retains expanded directory ids that still exist and always includes the root
 * @param tree Current tree root
 * @param prevExpandedItems Previously expanded item ids
 * @returns Normalized expanded item ids
 */
export function normalizeExpandedFileTreeItems(
  tree: FileNode,
  prevExpandedItems: string[]
): string[] {
  if (prevExpandedItems.length === 0) {
    return [tree.path];
  }

  const folderPaths = getFileTreeFolderPaths(tree);
  const retainedItems = prevExpandedItems.filter(item => folderPaths.has(item));

  return Array.from(new Set([tree.path, ...retainedItems]));
}

/**
 * Expands the root and any single-directory chain beneath it
 * @param tree Current tree root
 * @returns Auto-expanded directory paths
 */
export function getAutoExpandedFileTreeItems(tree: FileNode): string[] {
  const expandedItems = [tree.path];
  let currentNode: FileNode | undefined = tree;

  while (currentNode && currentNode.kind === 'directory') {
    const children: FileNode[] = currentNode.children ?? [];

    if (children.length !== 1 || children[0]?.kind !== 'directory') {
      break;
    }

    expandedItems.push(children[0].path);
    currentNode = children[0];
  }

  return expandedItems;
}

/**
 * Removes collapsed items from an expanded item list
 * @param prevExpandedItems Previously expanded item ids
 * @param collapsedPaths Paths being collapsed
 * @param collapseDescendants Whether descendant expanded ids should also collapse
 * @returns Expanded item ids after collapsing
 */
export function collapseExpandedFileTreeItems(
  prevExpandedItems: string[],
  collapsedPaths: Iterable<string>,
  collapseDescendants: boolean
): string[] {
  const uniqueCollapsedPaths = Array.from(new Set(collapsedPaths));

  if (prevExpandedItems.length === 0 || uniqueCollapsedPaths.length === 0) {
    return prevExpandedItems;
  }

  return collapseDescendants
    ? prevExpandedItems.filter(
        item =>
          !uniqueCollapsedPaths.some(path => isFileTreePathWithin(item, path))
      )
    : prevExpandedItems.filter(item => !uniqueCollapsedPaths.includes(item));
}

/**
 * Remaps expanded item ids after a subtree move
 * @param tree Current tree root
 * @param prevExpandedItems Previously expanded item ids
 * @param fromPath Previous subtree path
 * @param toPath New subtree path
 * @returns Normalized expanded item ids after path remapping
 */
export function remapExpandedFileTreeItemsAfterMove(
  tree: FileNode,
  prevExpandedItems: string[],
  fromPath: string,
  toPath: string
): string[] {
  return normalizeExpandedFileTreeItems(
    tree,
    prevExpandedItems.map(item =>
      remapFileTreePathPrefix(item, fromPath, toPath)
    )
  );
}
