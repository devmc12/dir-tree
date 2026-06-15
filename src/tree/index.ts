import type { FileNode, FileTreeItem } from '../reader/types';
import { attachFileTreeMetadata, getFileTreeMetadata } from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Provides pure file tree editing, visibility, and expansion utilities
 */

export interface FileTreeReadStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  duration: number;
}

export interface FileNodeLocation {
  node: FileNode;
  parent: FileNode | null;
  index: number;
}

export interface FileTreeMoveTarget {
  parentPath: string;
  childIndex: number | null;
}

export interface FileTreeMoveResult {
  tree: FileNode;
  fromPath: string;
  toPath: string;
}

export interface FileTreeRenameResult {
  tree: FileNode;
  fromPath: string;
  toPath: string;
}

export interface FileTreeCreateOptions {
  name: string;
  kind: 'file' | 'directory';
}

export interface FileTreeCreateResult {
  tree: FileNode;
  path: string;
  parentPath: string;
}

export type FileTreeVisibilityMode = 'hidden' | 'children-hidden';
export type FileTreeVisibilityMap = Record<string, FileTreeVisibilityMode>;

/**
 * Deeply clones a file tree node and its children
 * @param node File node to clone
 * @returns Cloned file node
 */
export function cloneFileNode(node: FileNode): FileNode {
  const clonedNode: FileNode = {
    ...node,
  };

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
  return getFileTreeMetadata(root)?.itemsByPath ?? buildFileTreeItems(root);
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
 * Builds a child path from a parent path and node name
 * @param parentPath Parent tree path
 * @param name Child node name
 * @returns Joined child path
 */
export function buildFileTreeChildPath(
  parentPath: string,
  name: string
): string {
  return parentPath ? `${parentPath}/${name}` : name;
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
 * Rewrites a path from one prefix to another
 * @param path Path to remap
 * @param prevPrefix Existing prefix to replace
 * @param nextPrefix Replacement prefix
 * @returns Remapped path, or the original path when outside the prefix
 */
export function remapFileTreePathPrefix(
  path: string,
  prevPrefix: string,
  nextPrefix: string
): string {
  if (prevPrefix === '') {
    if (path === '') {
      return nextPrefix;
    }

    return nextPrefix ? `${nextPrefix}/${path}` : path;
  }

  if (path === prevPrefix) {
    return nextPrefix;
  }

  if (!path.startsWith(`${prevPrefix}/`)) {
    return path;
  }

  return `${nextPrefix}${path.slice(prevPrefix.length)}`;
}

/**
 * Checks whether a path is equal to or nested under a prefix
 * @param path Path to test
 * @param prefix Prefix path
 * @returns True when the path is within the prefix
 */
export function isFileTreePathWithin(path: string, prefix: string): boolean {
  if (prefix === '') {
    return true;
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Removes paths that are already covered by selected ancestor paths
 * @param paths Candidate tree paths
 * @returns Top-level non-overlapping paths
 */
export function filterNestedFileTreePaths(paths: string[]): string[] {
  const topLevelPaths: string[] = [];
  const uniquePaths = Array.from(new Set(paths)).sort((leftPath, rightPath) => {
    const depthDelta = leftPath.split('/').length - rightPath.split('/').length;

    return depthDelta === 0 ? leftPath.localeCompare(rightPath) : depthDelta;
  });

  uniquePaths.forEach(path => {
    if (
      topLevelPaths.some(topLevelPath =>
        isFileTreePathWithin(path, topLevelPath)
      )
    ) {
      return;
    }

    topLevelPaths.push(path);
  });

  return topLevelPaths;
}

/**
 * Removes one node from a cloned tree
 * @param root Source tree root
 * @param targetPath Path of the node to remove
 * @returns Updated tree, or null when removing the root or a missing node
 */
export function removeFileTreeNode(
  root: FileNode,
  targetPath: string
): FileNode | null {
  if (root.path === targetPath) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target?.parent?.children) {
    return null;
  }

  target.parent.children.splice(target.index, 1);
  return nextRoot;
}

/**
 * Removes multiple nodes from a cloned tree while ignoring nested duplicates
 * @param root Source tree root
 * @param targetPaths Paths of nodes to remove
 * @returns Updated tree, null when the root is removed, or a clone when nothing is removed
 */
export function removeFileTreeNodes(
  root: FileNode,
  targetPaths: string[]
): FileNode | null {
  const removalPaths = filterNestedFileTreePaths(targetPaths);

  if (removalPaths.length === 0) {
    return cloneFileNode(root);
  }

  if (removalPaths.includes(root.path)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const removalIndexGroups = new Map<FileNode, number[]>();

  removalPaths.forEach(path => {
    const target = findFileNodeLocation(nextRoot, path);

    if (!target?.parent?.children) {
      return;
    }

    const indices = removalIndexGroups.get(target.parent) ?? [];

    indices.push(target.index);
    removalIndexGroups.set(target.parent, indices);
  });

  removalIndexGroups.forEach((indices, parent) => {
    indices
      .slice()
      .sort((leftIndex, rightIndex) => rightIndex - leftIndex)
      .forEach(index => {
        parent.children?.splice(index, 1);
      });
  });

  return nextRoot;
}

/**
 * Creates a file or directory next to or inside the target node
 * @param root Source tree root
 * @param targetPath Target node path used to choose insertion location
 * @param options New node name and kind
 * @returns Creation result with updated tree and path, or null when invalid
 */
export function createFileTreeNode(
  root: FileNode,
  targetPath: string,
  options: FileTreeCreateOptions
): FileTreeCreateResult | null {
  const normalizedName = options.name.trim();

  if (!isValidFileNodeName(normalizedName)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target) {
    return null;
  }

  const parentNode =
    target.node.kind === 'directory' ? target.node : target.parent;

  if (!parentNode || parentNode.kind !== 'directory') {
    return null;
  }

  if (hasFileNodeNameConflict(parentNode, normalizedName, '')) {
    return null;
  }

  const nextPath = buildFileTreeChildPath(parentNode.path, normalizedName);
  const nextNode: FileNode =
    options.kind === 'directory'
      ? {
          name: normalizedName,
          path: nextPath,
          kind: 'directory',
          children: [],
        }
      : {
          name: normalizedName,
          path: nextPath,
          kind: 'file',
        };
  const children = parentNode.children ?? (parentNode.children = []);

  if (target.node.kind === 'directory') {
    children.push(nextNode);
  } else {
    children.splice(target.index + 1, 0, nextNode);
  }

  return {
    tree: nextRoot,
    path: nextPath,
    parentPath: parentNode.path,
  };
}

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
  const nextVisibility: FileTreeVisibilityMap = {};

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
  const nextVisibility: FileTreeVisibilityMap = {};

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
    const visibilityMode = visibility[node.path];

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
 * Moves a node into a target parent at an optional child index
 * @param root Source tree root
 * @param dragPath Path of the node being moved
 * @param target Destination parent path and insertion index
 * @returns Move result with updated tree and paths, or null when invalid
 */
export function moveFileTreeNode(
  root: FileNode,
  dragPath: string,
  target: FileTreeMoveTarget
): FileTreeMoveResult | null {
  const nextRoot = cloneFileNode(root);
  const source = findFileNodeLocation(nextRoot, dragPath);

  if (!source?.parent?.children || source.node.path === nextRoot.path) {
    return null;
  }

  const targetParent = findFileNodeLocation(nextRoot, target.parentPath);

  if (!targetParent || targetParent.node.kind !== 'directory') {
    return null;
  }

  if (
    targetParent.node.path === source.node.path ||
    targetParent.node.path.startsWith(`${source.node.path}/`)
  ) {
    return null;
  }

  const movedNode = source.parent.children.splice(source.index, 1)[0];

  if (!movedNode) {
    return null;
  }

  const targetChildren =
    targetParent.node.children ?? (targetParent.node.children = []);
  let insertIndex =
    target.childIndex === null ? targetChildren.length : target.childIndex;

  if (
    source.parent.path === targetParent.node.path &&
    source.index < insertIndex
  ) {
    insertIndex -= 1;
  }

  insertIndex = Math.max(0, Math.min(insertIndex, targetChildren.length));
  targetChildren.splice(insertIndex, 0, movedNode);

  const nextPath = buildFileTreeChildPath(
    targetParent.node.path,
    movedNode.name
  );

  updateFileNodePath(movedNode, nextPath);

  return {
    tree: nextRoot,
    fromPath: dragPath,
    toPath: nextPath,
  };
}

/**
 * Renames a node and remaps all descendant paths
 * @param root Source tree root
 * @param targetPath Path of the node to rename
 * @param nextName Requested new node name
 * @returns Rename result with updated tree and paths, or null when invalid
 */
export function renameFileTreeNode(
  root: FileNode,
  targetPath: string,
  nextName: string
): FileTreeRenameResult | null {
  const normalizedName = nextName.trim();

  if (!isValidFileNodeName(normalizedName)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target) {
    return null;
  }

  if (
    hasFileNodeNameConflict(target.parent, normalizedName, target.node.path)
  ) {
    return null;
  }

  if (target.node.name === normalizedName) {
    return {
      tree: nextRoot,
      fromPath: targetPath,
      toPath: targetPath,
    };
  }

  target.node.name = normalizedName;

  const nextPath = target.parent
    ? buildFileTreeChildPath(target.parent.path, normalizedName)
    : normalizedName;

  updateFileNodePath(target.node, nextPath);

  return {
    tree: nextRoot,
    fromPath: targetPath,
    toPath: nextPath,
  };
}

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

/**
 * Removes runtime handles from a tree in place before transfer
 * @param node Node to strip
 * @returns The same node after handle removal
 */
export function stripFileNodeHandles(node: FileNode): FileNode {
  delete node.handle;
  node.children?.forEach(stripFileNodeHandles);

  return node;
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
 * Builds a path-indexed item lookup by traversing a tree
 * @param root File tree root
 * @returns Item lookup keyed by path
 */
function buildFileTreeItems(root: FileNode): Record<string, FileTreeItem> {
  const items: Record<string, FileTreeItem> = {};
  const stack: FileNode[] = [root];

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

    items[node.path] = item;

    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index];

      if (child) {
        stack.push(child);
      }
    }
  }

  return items;
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
 * Updates a node path and all descendant paths in place
 * @param node Node whose path changed
 * @param nextPath New path for the node
 */
function updateFileNodePath(node: FileNode, nextPath: string): void {
  node.path = nextPath;
  node.children?.forEach(child => {
    updateFileNodePath(child, buildFileTreeChildPath(nextPath, child.name));
  });
}

/**
 * Checks whether a node name is non-empty and single-segment
 * @param name Candidate node name
 * @returns True when the name can be used in a tree path
 */
function isValidFileNodeName(name: string): boolean {
  return name.length > 0 && !name.includes('/');
}

/**
 * Checks whether a parent already contains the requested child name
 * @param parent Parent node to inspect
 * @param nextName Requested child name
 * @param currentPath Existing node path allowed to keep the same name
 * @returns True when another sibling already has the requested name
 */
function hasFileNodeNameConflict(
  parent: FileNode | null,
  nextName: string,
  currentPath: string
): boolean {
  return (
    parent?.children?.some(
      child => child.name === nextName && child.path !== currentPath
    ) ?? false
  );
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
