import type { FileNode, FileTreeItem } from '../reader/types';
import { copyFileNodeFields } from '../reader/snapshot';
import {
  attachFileTreeMetadata,
  buildFileTreeMetadata,
  getFileTreeMetadata,
} from '../reader/metadata';
import type { FileNodeLocation, FileTreeReadStats } from './types';

/**
 * Date: 2026-11-07
 * Desc: Clones, locates, indexes, and counts file tree nodes
 */

/**
 * Recursively copies a file tree's structural fields and metadata values
 * @param node File node to clone
 * @returns A separate tree without attached lookup indexes
 */
export function cloneFileNode(node: FileNode): FileNode {
  const clonedNode = copyFileNodeFields(node);

  if (node.children) {
    clonedNode.children = node.children.map(cloneFileNode);
  }

  return clonedNode;
}

/**
 * Clones a tree and attaches lookup metadata to the cloned root
 * @param root Source file tree root
 * @returns Prepared file tree with metadata attached
 */
export function createPreparedFileTree(root: FileNode): FileNode {
  const tree = cloneFileNode(root);

  attachFileTreeMetadata(tree);
  return tree;
}

/**
 * Returns file tree items from attached metadata or builds them on demand
 * @param root File tree root
 * @returns Item lookup keyed by path
 */
export function getFileTreeItems(root: FileNode): Record<string, FileTreeItem> {
  return (
    getFileTreeMetadata(root)?.itemsByPath ??
    buildFileTreeMetadata(root).itemsByPath
  );
}

/**
 * Returns folder paths from attached metadata or builds them on demand
 * @param root File tree root
 * @returns Set of directory paths
 */
export function getFileTreeFolderPaths(root: FileNode): Set<string> {
  return (
    getFileTreeMetadata(root)?.folderPaths ?? collectFileTreeFolderPaths(root)
  );
}

/**
 * Finds a node location and its parent context by path
 * @param root Current subtree root
 * @param targetPath Path to locate
 * @param parent Parent node of the current root
 * @param index Index of the current root within the parent
 * @returns Node location, or null when not found
 */
export function findFileNodeLocation(
  root: FileNode,
  targetPath: string,
  parent: FileNode | null = null,
  index = -1
): FileNodeLocation | null {
  if (root.path === targetPath) {
    return {
      node: root,
      parent,
      index,
    };
  }

  for (
    let childIndex = 0;
    childIndex < (root.children?.length ?? 0);
    childIndex += 1
  ) {
    const child = root.children?.[childIndex];

    if (!child) {
      continue;
    }

    const result = findFileNodeLocation(child, targetPath, root, childIndex);

    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Creates a cloned tree rooted at a focused directory
 * @param root Source tree root
 * @param focusedRootPath Directory path to focus
 * @returns Focused tree with metadata, or null when the path is not a directory
 */
export function createFocusedFileTree(
  root: FileNode,
  focusedRootPath: string
): FileNode | null {
  const focusedLocation = findFileNodeLocation(root, focusedRootPath);

  if (!focusedLocation || focusedLocation.node.kind !== 'directory') {
    return null;
  }

  const focusedTree = cloneFileNode(focusedLocation.node);

  attachFileTreeMetadata(focusedTree);
  return focusedTree;
}

/**
 * Creates read statistics from attached metadata or by counting the tree
 * @param tree File tree root
 * @param duration Read duration in milliseconds
 * @returns File count, directory count, size, and duration
 */
export function createFileTreeReadStats(
  tree: FileNode,
  duration: number
): FileTreeReadStats {
  const metadata = getFileTreeMetadata(tree);
  const stats = metadata
    ? {
        files: metadata.stats.totalFiles,
        dirs: metadata.stats.totalDirs,
        size: metadata.stats.totalSize,
      }
    : countFileTreeNodes(tree);

  return {
    totalFiles: stats.files,
    totalDirs: stats.dirs,
    totalSize: stats.size,
    duration,
  };
}

/**
 * Collects all directory paths in a tree
 * @param root File tree root
 * @returns Set of directory paths
 */
function collectFileTreeFolderPaths(root: FileNode): Set<string> {
  const folderPaths = new Set<string>();
  const stack: FileNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node) {
      continue;
    }

    if (node.kind === 'directory') {
      folderPaths.add(node.path);
    }

    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index];

      if (child) {
        stack.push(child);
      }
    }
  }

  return folderPaths;
}

/**
 * Counts files, directories, and byte size in a tree
 * @param node Current node to count
 * @returns Aggregate count and size totals
 */
function countFileTreeNodes(node: FileNode): {
  dirs: number;
  files: number;
  size: number;
} {
  let files = node.kind === 'file' ? 1 : 0;
  let dirs = node.kind === 'directory' ? 1 : 0;
  let size = node.size ?? 0;

  node.children?.forEach(child => {
    const childStats = countFileTreeNodes(child);

    files += childStats.files;
    dirs += childStats.dirs;
    size += childStats.size;
  });

  return { dirs, files, size };
}
